// src/lib/server/tables.ts
'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getCurrentStaff } from '@/app/staff/page';
import { getLocalBySlug } from '@/lib/server/local';
import { revalidatePath } from 'next/cache';
import { AppError, parseOrThrow, parsePostgrestError, queryOrThrow } from '@/lib/errors';
import { z } from 'zod';
import type { RestaurantTable, TableStatus, TableQrStatus, Zone, PaymentMethod } from '@/lib/types';
import crypto from 'node:crypto';

const TableSchema = z.object({
  id: z.string().uuid().optional(),
  zone: z.enum(['INTERIOR', 'TERRAZA', 'BARRA'], { message: 'Zona inválida' }),
  table_number: z.string().min(1, 'El identificador de mesa es obligatorio'),
  min_capacity: z.number().int().min(1).default(1),
  max_capacity: z.number().int().min(1),
  is_active: z.boolean().default(true),
});

async function getStaffContext() {
  const { staff } = await getCurrentStaff();
  return staff;
}

/**
 * Sincroniza la capacidad acumulada de la zona en `local_zone_capacity`
 * sumando las capacidades máximas de las mesas activas de dicha zona.
 */
export async function syncZoneCapacityFromTables(locationId: string, zone: Zone) {
  const supabase = createServerClient();
  const { data: tables, error } = await supabase
    .from('restaurant_tables')
    .select('max_capacity')
    .eq('location_id', locationId)
    .eq('zone', zone)
    .eq('is_active', true);

  if (error) return; // Si la tabla aún no existe, no bloquear

  const totalCapacity = (tables || []).reduce((acc, t) => acc + (t.max_capacity || 0), 0);

  if (totalCapacity > 0) {
    await supabase.from('local_zone_capacity').upsert(
      { location_id: locationId, zone, capacity: totalCapacity },
      { onConflict: 'location_id,zone' }
    );
  }
}

/**
 * Obtiene todas las mesas físicas de la sucursal actual del staff.
 */
export async function getStaffTables(): Promise<RestaurantTable[]> {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('restaurant_tables')
    .select('*')
    .eq('location_id', staff.location_id)
    .order('table_number', { ascending: true });

  if (error) {
    if (error.code === '42P01' || error.message?.includes('does not exist')) {
      return [];
    }
    console.error('getStaffTables error:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudieron cargar las mesas'));
  }

  return (data || []) as RestaurantTable[];
}

/**
 * Crea o actualiza una mesa física en el restaurante.
 */
export async function upsertTable(payload: z.infer<typeof TableSchema>) {
  const staff = await getStaffContext();
  const validated = parseOrThrow(TableSchema, payload);

  if (validated.max_capacity < validated.min_capacity) {
    throw new AppError('La capacidad máxima debe ser mayor o igual a la mínima');
  }

  const supabase = createServerClient();
  const tableRecord = {
    ...validated,
    location_id: staff.location_id,
    updated_at: new Date().toISOString(),
  };

  const data = await queryOrThrow(
    supabase
      .from('restaurant_tables')
      .upsert(tableRecord)
      .select('*')
      .single(),
    { action: 'upsertTable', fallback: 'No se pudo guardar la mesa' }
  );

  // Sincronizar automáticamente el aforo total de la zona
  await syncZoneCapacityFromTables(staff.location_id, validated.zone);

  revalidatePath('/staff/admin');
  return data as RestaurantTable;
}

/**
 * Elimina una mesa física.
 */
export async function deleteTable(id: string) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  // Obtener la zona antes de borrar para recalcular aforo
  const { data: current } = await supabase
    .from('restaurant_tables')
    .select('zone')
    .eq('id', id)
    .eq('location_id', staff.location_id)
    .maybeSingle();

  const { error } = await supabase
    .from('restaurant_tables')
    .delete()
    .eq('id', id)
    .eq('location_id', staff.location_id);

  if (error) {
    console.error('deleteTable error:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudo eliminar la mesa'));
  }

  if (current?.zone) {
    await syncZoneCapacityFromTables(staff.location_id, current.zone as Zone);
  }

  revalidatePath('/staff/admin');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// OPERACIONES DE HOSTESS Y SALA (TIEMPO REAL)
// ---------------------------------------------------------------------------

/**
 * Cambia el estado de una mesa (LIBRE, RESERVADA, OCUPADA, EN_LIMPIEZA).
 */
export async function updateTableStatus(
  tableId: string,
  status: TableStatus,
  guests?: number
) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'LIBRE') {
    updateData.current_guests = 0;
    updateData.current_session_id = null;
    updateData.qr_status = 'INACTIVO';
  } else if (status === 'OCUPADA' && typeof guests === 'number') {
    updateData.current_guests = guests;
  }

  const { data, error } = await supabase
    .from('restaurant_tables')
    .update(updateData)
    .eq('id', tableId)
    .eq('location_id', staff.location_id)
    .select('*')
    .single();

  if (error) {
    console.error('updateTableStatus error:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudo actualizar el estado de la mesa'));
  }

  revalidatePath('/staff/admin');
  return data as RestaurantTable;
}

/**
 * Abre la mesa para pedidos por código QR.
 * Inicia una sesión de comanda activa para acumular pedidos del cliente.
 */
export async function openTableQrSession(tableId: string, guests = 2) {
  const staff = await getStaffContext();
  const supabase = createServerClient();
  const newSessionId = crypto.randomUUID();

  const { data, error } = await supabase
    .from('restaurant_tables')
    .update({
      status: 'OCUPADA',
      qr_status: 'ABIERTO',
      current_session_id: newSessionId,
      current_guests: guests,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tableId)
    .eq('location_id', staff.location_id)
    .select('*')
    .single();

  if (error) {
    console.error('openTableQrSession error:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudo abrir la mesa para QR'));
  }

  revalidatePath('/staff/admin');
  return { ok: true, session_id: newSessionId, table: data as RestaurantTable };
}

/**
 * Cierra la sesión de QR de la mesa para pedir la cuenta y bloquear nuevos pedidos.
 */
export async function closeTableQrSession(tableId: string) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('restaurant_tables')
    .update({
      qr_status: 'INACTIVO',
      updated_at: new Date().toISOString(),
    })
    .eq('id', tableId)
    .eq('location_id', staff.location_id)
    .select('*')
    .single();

  if (error) {
    console.error('closeTableQrSession error:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudo cerrar la mesa'));
  }

  revalidatePath('/staff/admin');
  return { ok: true, table: data as RestaurantTable };
}

/**
 * Consulta pública para verificar el estado de una mesa al escanear el QR.
 */
export async function getPublicTableStatus(locationSlug: string, tableNumber: string, qrToken?: string) {
  const local = await getLocalBySlug(locationSlug);
  if (!local) return { ok: false, error: 'Sucursal no encontrada' };

  const supabase = createServerClient();
  let query = supabase
    .from('restaurant_tables')
    .select('id, table_number, zone, min_capacity, max_capacity, status, qr_status, current_session_id')
    .eq('location_id', local.id)
    .eq('table_number', tableNumber)
    .eq('is_active', true);

  if (qrToken) {
    query = query.eq('qr_token', qrToken);
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) {
    return { ok: false, error: 'Mesa no encontrada o inactiva' };
  }

  return {
    ok: true,
    local: { id: local.id, name: local.name, slug: local.slug },
    table: data as Pick<RestaurantTable, 'id' | 'table_number' | 'zone' | 'min_capacity' | 'max_capacity' | 'status' | 'qr_status' | 'current_session_id'>,
  };
}

/**
 * Obtiene el slug de la sucursal actual del staff autenticado.
 */
export async function getStaffLocationSlug(): Promise<string | null> {
  try {
    const staff = await getStaffContext();
    const supabase = createServerClient();
    const { data } = await supabase
      .from('locals')
      .select('slug')
      .eq('id', staff.location_id)
      .maybeSingle();
    return data?.slug || null;
  } catch {
    return null;
  }
}

/**
 * Cobra y liquida la cuenta completa de una mesa.
 * - Marca todas las órdenes activas y pendientes de pago de la mesa como COBRADO y COMPLETADO.
 * - Asigna el método de pago seleccionado en caja.
 * - Libera la mesa física (status: 'LIBRE', qr_status: 'INACTIVO', current_session_id: null).
 * - Rota el qr_token para cerrar de forma segura el acceso al QR anterior.
 */
export async function chargeAndCloseTableAccount(
  tableId: string,
  paymentMethod: PaymentMethod = 'EFECTIVO_EXACTO'
) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  // 1. Obtener la mesa
  const { data: table, error: tableErr } = await supabase
    .from('restaurant_tables')
    .select('id, table_number, location_id')
    .eq('id', tableId)
    .eq('location_id', staff.location_id)
    .single();

  if (tableErr || !table) {
    throw new AppError('Mesa no encontrada en esta sucursal');
  }

  // 2. Liquidar las órdenes de la mesa que estén pendientes de pago
  const { data: updatedOrders, error: ordersErr } = await supabase
    .from('orders')
    .update({
      payment_status: 'COBRADO',
      status: 'COMPLETADO',
      payment_method: paymentMethod,
      updated_at: new Date().toISOString(),
    })
    .eq('location_id', staff.location_id)
    .eq('table_id', tableId)
    .eq('payment_status', 'PENDIENTE')
    .neq('status', 'CANCELADO')
    .select('id, total');

  if (ordersErr) {
    console.error('chargeAndCloseTableAccount error:', ordersErr);
    throw new AppError(parsePostgrestError(ordersErr, 'No se pudieron actualizar los pedidos de la mesa'));
  }

  // 3. Liberar la mesa y renovar token de QR
  const newQrToken = crypto.randomUUID();
  const { error: releaseErr } = await supabase
    .from('restaurant_tables')
    .update({
      status: 'LIBRE',
      qr_status: 'INACTIVO',
      current_session_id: null,
      current_guests: 0,
      qr_token: newQrToken,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tableId)
    .eq('location_id', staff.location_id);

  if (releaseErr) {
    console.error('chargeAndCloseTableAccount / release error:', releaseErr);
    throw new AppError(parsePostgrestError(releaseErr, 'No se pudo liberar la mesa'));
  }

  revalidatePath('/staff/admin');
  revalidatePath('/staff/orders');
  return { ok: true, count: updatedOrders?.length || 0, tableNumber: table.table_number };
}

