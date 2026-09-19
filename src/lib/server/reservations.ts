// src/lib/server/reservations.ts
'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getCurrentStaff } from '@/app/staff/page';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { AppError, parseOrThrow, parsePostgrestError, queryOrThrow } from '@/lib/errors';
import { zNumberES } from '@/lib/validation';
import type { ReservationStatus, Zone } from '@/lib/types';

// --- Schemas ---
const ReservationSchema = z.object({
  holder_name: z.string().min(1, 'El nombre es requerido'),
  holder_phone: z.string().min(5, 'El teléfono es requerido'),
  reservation_date: z.string().min(1, 'La fecha es requerida'), // ISO date string (YYYY-MM-DD)
  reservation_time: z.string().min(1, 'La hora es requerida'), // HH:mm format
  party_size: zNumberES('El tamaño del grupo debe ser un número').int().positive('El tamaño del grupo debe ser mayor a 0'),
  preferred_zone: z.enum(['INTERIOR', 'TERRAZA', 'BARRA'], { message: 'Elige una zona válida.' }),
  status: z.enum(['PENDIENTE', 'CONFIRMADA', 'CANCELADA', 'NO_SHOW']).default('PENDIENTE'),
  deposit_status: z.enum(['SIN_DEPOSITO', 'DEPOSITO_PENDIENTE', 'DEPOSITADO']).default('SIN_DEPOSITO'),
  notes: z.string().nullish(),
});

async function getStaffContext() {
  const { staff } = await getCurrentStaff();
  return staff;
}

// --- Zone Capacity ---

export async function getZoneCapacities() {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('local_zone_capacity')
    .select('zone, capacity')
    .eq('location_id', staff.location_id);

  if (error) throw error;
  return data || [];
}

// --- Reservations ---

export async function listReservations(startDate: string, endDate: string) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  await supabase.rpc('set_config', {
    name: 'app.local_id',
    value: staff.location_id,
    is_local: true,
  });

  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .gte('reservation_date', startDate)
    .lte('reservation_date', endDate)
    .order('reservation_date', { ascending: true })
    .order('reservation_time', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createReservation(payload: z.infer<typeof ReservationSchema>) {
  const staff = await getStaffContext();
  const validated = parseOrThrow(ReservationSchema, payload);
  const supabase = createServerClient();

  const data = await queryOrThrow(
    supabase
      .from('reservations')
      .insert({
        ...validated,
        location_id: staff.location_id,
        created_by: staff.id,
      })
      .select()
      .single(),
    { action: 'createReservation', fallback: 'No se pudo crear la reserva. Inténtalo de nuevo.' }
  );

  revalidatePath('/staff/admin');
  return data;
}

export async function updateReservation(id: string, payload: Partial<z.infer<typeof ReservationSchema>>) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  // Verify ownership
  const { data: res } = await supabase
    .from('reservations')
    .select('id')
    .eq('id', id)
    .eq('location_id', staff.location_id)
    .single();

  if (!res) throw new AppError('Reserva no encontrada. Es posible que ya haya sido eliminada.');

  const partial = parseOrThrow(ReservationSchema.partial(), payload);

  const data = await queryOrThrow(
    supabase
      .from('reservations')
      .update({
        ...partial,
        updated_by: staff.id,
      })
      .eq('id', id)
      .select()
      .single(),
    { action: 'updateReservation', fallback: 'No se pudo actualizar la reserva.' }
  );

  revalidatePath('/staff/admin');
  return data;
}

export async function deleteReservation(id: string) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('reservations')
    .delete()
    .eq('id', id)
    .eq('location_id', staff.location_id);

  if (error) {
    console.error('deleteReservation:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudo eliminar la reserva.'));
  }

  revalidatePath('/staff/admin');
  return { ok: true };
}

export async function changeReservationStatus(id: string, status: ReservationStatus) {
  return updateReservation(id, { status });
}
