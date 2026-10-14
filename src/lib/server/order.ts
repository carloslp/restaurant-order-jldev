// Server actions / queries para órdenes.
// - Cliente: getOrderByDeliveryToken, markOrderAsDeliveredByToken
// - Staff: listOrdersForLocation, updateOrderStatus (con validación de transición)

'use server';

import { createServerClient } from '@/lib/supabase/server';
import { verifyToken } from '@/lib/tokens';
import { generateToken, hashToken } from '@/lib/tokens';
import type { Order, OrderStatus } from '@/lib/types';
import { getCurrentStaff } from '@/app/staff/page';
import { parsePostgrestError, describeSupabaseError } from '@/lib/errors';
import { logAudit } from '@/lib/server/audit';

// ---------------------------------------------------------------------------
// Tokens de reparto: filas del join delivery_tokens × orders que devuelven
// las queries de arriba. Las queries corren con service role y sin generics
// de Database, así que tipamos explícitamente lo que devuelven.
// ---------------------------------------------------------------------------

type DeliveryTokenCandidateBase = {
  id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  order_id: string;
};

// join '*, orders!inner(id, status, delivery_token_expires_at)'
type DeliveryTokenCandidate = DeliveryTokenCandidateBase & {
  orders: Pick<Order, 'id' | 'status' | 'delivery_token_expires_at'>;
};

// join '*, orders!inner(*)'
type DeliveryTokenWithOrder = DeliveryTokenCandidateBase & {
  orders: Order;
};

/**
 * Fetch an order by its delivery_token (UUID string).
 * Used by the client tracking page.
 */
export async function getOrderByDeliveryToken(deliveryToken: string): Promise<Order | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('orders')
    .select('id, location_id, status, order_type, customer_name, delivery_address, delivery_zone, eta, total, created_at, delivered_at')
    .eq('delivery_token', deliveryToken)
    .single();

  if (error || !data) {
    return null;
  }

  // Sanitizar PII para prevenir fuga de datos si el token público es compartido
  return {
    ...data,
    customer_phone: '***',
    notes: null,
    delivery_references: null,
  } as Order;
}

/**
 * Mark an order as delivered using the repartidor's single-use token.
 * Validates the plain token against the hash in delivery_tokens,
 * then updates the order status to COMPLETED and sets delivered_at.
 * Also marks the delivery token as used.
 */
export async function markOrderAsDeliveredByToken(plainToken: string): Promise<{ ok: boolean; error?: string; orderId?: string }> {
  const supabase = createServerClient();

  // 1. Find all valid (unused, unrevoked, unexpired) delivery token candidates
  const { data: candidates, error: tokenError } = await supabase
    .from('delivery_tokens')
    .select('id, token_hash, orders!inner(id, status, delivery_token_expires_at)')
    .is('used_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString());

  if (tokenError || !candidates?.length) {
    return { ok: false, error: 'Token inválido, usado, revocado o expirado' };
  }

  // 2. Find the specific token by verifying the plain token against each candidate's hash
  const tokenRecord = (candidates as unknown as DeliveryTokenCandidate[]).find((c) =>
    verifyToken(plainToken, c.token_hash)
  );
  if (!tokenRecord) {
    return { ok: false, error: 'Token inválido' };
  }

  const order = tokenRecord.orders;

  // 3. Check if the order is already in a terminal state (optional, but we can prevent updating if already completed/cancelled)
  if (order.status === 'COMPLETADO' || order.status === 'CANCELADO') {
    return { ok: false, error: 'El pedido ya está en estado terminal' };
  }

  // 4. Update the order: set status to COMPLETED, delivered_at to now
  const { data: updatedOrder, error: orderError } = await supabase
    .from('orders')
    .update({
      status: 'COMPLETADO',
      delivered_at: new Date().toISOString(),
    })
    .eq('id', order.id)
    .select('id')
    .single();

  if (orderError || !updatedOrder) {
    return { ok: false, error: 'No se pudo actualizar el pedido' };
  }

  // 5. Mark the delivery token as used
  const { error: tokenUpdateError } = await supabase
    .from('delivery_tokens')
    .update({
      used_at: new Date().toISOString(),
    })
    .eq('id', tokenRecord.id);

  if (tokenUpdateError) {
    // The order is already delivered; the token can be cleaned up later.
    console.error('Error marking delivery token as used:', tokenUpdateError);
  }

  return {
    ok: true,
    orderId: updatedOrder.id,
  };
}

/**
 * Fetch an order by its plain delivery token (used by repartidor).
 * Used by the repartidor tracking page.
 */
export async function getOrderByPlainToken(plainToken: string): Promise<Order | null> {
  const supabase = createServerClient();

  // 1. Find all valid (unused, unrevoked, unexpired) delivery token candidates
  const { data: candidates, error: tokenError } = await supabase
    .from('delivery_tokens')
    .select('id, token_hash, orders!inner(id, status, order_type, customer_name, customer_phone, delivery_address, delivery_references, delivery_zone, payment_method, eta, total, cart_snapshot, delivered_at)')
    .is('used_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString());

  if (tokenError || !candidates?.length) {
    return null;
  }

  // 2. Find the specific token by verifying the plain token against each candidate's hash
  const tokenRecord = (candidates as unknown as DeliveryTokenWithOrder[]).find((c) =>
    verifyToken(plainToken, c.token_hash)
  );
  if (!tokenRecord) {
    return null;
  }

  // 3. Return the associated order
  return tokenRecord.orders;
}

// ---------------------------------------------------------------------------
// Staff: asignación de repartidor + link de reparto (Caja).
// Campo orders.driver_id incluido nativamente en docs/install.sql.
// ---------------------------------------------------------------------------

/**
 * Asigna un repartidor (staff del mismo local) a una orden de domicilio.
 */
export async function assignDriver(
  orderId: string,
  driverId: string | null
): Promise<{ ok: boolean; error?: string }> {
  const { staff } = await getCurrentStaff();
  const supabase = createServerClient();

  // 1. La orden debe existir y ser de este local.
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, order_type, location_id')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return { ok: false, error: 'Orden no encontrada. Es posible que ya haya sido eliminada.' };
  }
  if (order.location_id !== staff.location_id) {
    return { ok: false, error: 'Esta orden no pertenece a tu local.' };
  }
  if (order.order_type !== 'DOMICILIO') {
    return { ok: false, error: 'Solo se asigna repartidor a pedidos a domicilio.' };
  }

  // 2. driverId null = desasignar. Si viene, validar que sea staff activo del local.
  if (driverId) {
    const { data: driver } = await supabase
      .from('staff')
      .select('id')
      .eq('id', driverId)
      .eq('location_id', staff.location_id)
      .eq('is_active', true)
      .maybeSingle();

    if (!driver) {
      return { ok: false, error: 'Ese repartidor no pertenece a tu local o está inactivo.' };
    }
  }

  // 3. Asignar.
  const { error: updateError } = await supabase
    .from('orders')
    .update({ driver_id: driverId })
    .eq('id', orderId);

  if (updateError) {
    console.error('assignDriver/update:', updateError);
    return {
      ok: false,
      error: parsePostgrestError(updateError, 'No se pudo asignar el repartidor. Inténtalo de nuevo.'),
    };
  }

  return { ok: true };
}

/**
 * Revoca los tokens de reparto vigentes de la orden y genera uno nuevo
 * de un solo uso (2h). Devuelve la URL para el repartidor (un solo uso,
 * se vuelve de solo lectura tras confirmar la entrega).
 */
export async function regenerateDeliveryToken(
  orderId: string
): Promise<{ ok: boolean; error?: string; url?: string; token?: string }> {
  const { staff } = await getCurrentStaff();
  const supabase = createServerClient();

  // 1. La orden debe existir, ser de este local y estar activa.
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, status, location_id, order_type')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return { ok: false, error: 'Orden no encontrada. Es posible que ya haya sido eliminada.' };
  }
  if (order.location_id !== staff.location_id) {
    return { ok: false, error: 'Esta orden no pertenece a tu local.' };
  }
  if (['COMPLETADO', 'CANCELADO'].includes(order.status)) {
    return { ok: false, error: 'El pedido ya está cerrado; no se puede regenerar el link.' };
  }

  // 2. Revocar tokens vigentes (los usados/expirados se quedan como histórico).
  const { error: revokeError } = await supabase
    .from('delivery_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('order_id', orderId)
    .is('used_at', null)
    .is('revoked_at', null);

  if (revokeError) {
    console.error('regenerateDeliveryToken/revoke:', revokeError);
    return { ok: false, error: 'No se pudo revocar el link anterior. Inténtalo de nuevo.' };
  }

  // 3. Generar token nuevo (hash-only en DB; 2h de validez).
  const plainToken = generateToken();
  const tokenHash = hashToken(plainToken);
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

  const { error: insertError } = await supabase
    .from('delivery_tokens')
    .insert({ order_id: orderId, token_hash: tokenHash, expires_at: expiresAt });

  if (insertError) {
    console.error('regenerateDeliveryToken/insert:', insertError);
    return {
      ok: false,
      error: parsePostgrestError(insertError, 'No se pudo generar el nuevo link. Inténtalo de nuevo.'),
    };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return {
    ok: true,
    token: plainToken,
    url: `${baseUrl}/track/repartidor/${plainToken}`,
  };
}


// ---------------------------------------------------------------------------
// Staff: listar pedidos del local (fuente de la carga inicial de Caja/KDS).
// ---------------------------------------------------------------------------

export async function listOrdersForLocation(opts?: {
  statuses?: OrderStatus[];
  limit?: number;
  includePendingTableOrders?: boolean;
}): Promise<Order[]> {
  const { staff } = await getCurrentStaff();
  const supabase = createServerClient();

  // El cliente service role SE SALTA RLS: el GUC app.local_id no filtra nada
  // aquí. El aislamiento por local debe ser un filtro explícito de la query
  // (el rpc set_config se mantiene por si algún trigger lee el GUC, pero la
  // seguridad real vive en el .eq('location_id', ...)).
  await supabase.rpc('set_config', {
    name: 'app.local_id',
    value: staff.location_id,
    is_local: true,
  });

  let query = supabase
    .from('orders')
    .select('id, location_id, order_type, status, payment_status, payment_method, customer_name, customer_phone, delivery_address, delivery_references, delivery_zone, notes, subtotal, iva_amount, delivery_fee, discount_amount, discount_code, total, cart_snapshot, table_id, eta, created_at, updated_at, delivered_at, driver_id')
    .eq('location_id', staff.location_id) // filtro explícito: service role salta RLS
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 100);

  if (opts?.statuses?.length) {
    if (opts.includePendingTableOrders) {
      query = query.or(`status.in.(${opts.statuses.join(',')}),and(order_type.eq.EN_MESA,payment_status.eq.PENDIENTE)`);
    } else {
      query = query.in('status', opts.statuses);
    }
  }

  const { data, error } = await query;

  if (error) {
    // No tragar el error en silencio: sin log, Caja/KDS quedan vacías sin
    // explicación (síntoma: "el pedido no aparece").
    console.error('listOrdersForLocation:', describeSupabaseError(error));
    return [];
  }

  return (data ?? []) as unknown as Order[];
}

// Transiciones válidas según el flujo de negocio (sin roles)
// Cualquier usuario autenticado con staff puede hacer cualquier transición válida
const VALID_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  CREADO: ['CONFIRMADO_CAJA', 'CANCELADO'],
  CONFIRMADO_CAJA: ['EN_PREPARACION', 'CANCELADO'],
  EN_PREPARACION: ['LISTO', 'CANCELADO'],
  LISTO: ['LISTO_PARA_ENTREGA', 'COMPLETADO', 'CANCELADO'],
  LISTO_PARA_ENTREGA: ['COMPLETADO', 'CANCELADO'],
  // Estados terminales - no se pueden cambiar
  COMPLETADO: [],
  CANCELADO: [],
};

// Etiquetas legibles para los mensajes de error de transición.
const STATUS_LABELS: Record<OrderStatus, string> = {
  CREADO: 'creado',
  CONFIRMADO_CAJA: 'confirmado en caja',
  EN_PREPARACION: 'en preparación',
  LISTO: 'listo',
  LISTO_PARA_ENTREGA: 'listo para entrega',
  COMPLETADO: 'completado',
  CANCELADO: 'cancelado',
};

export async function updateOrderStatus(
  orderId: string,
  nextStatus: OrderStatus
): Promise<{ ok: boolean; error?: string }> {
  const { staff } = await getCurrentStaff();
  const supabase = createServerClient();

  // 1. Cargar la orden actual
  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('id, status, location_id')
    .eq('id', orderId)
    .single();

  if (fetchError || !order) {
    if (fetchError) console.error('updateOrderStatus/fetch:', fetchError);
    return { ok: false, error: 'Orden no encontrada. Es posible que ya haya sido eliminada.' };
  }

  // 2. Validar que sea del mismo local
  if (order.location_id !== staff.location_id) {
    return { ok: false, error: 'Esta orden no pertenece a tu local.' };
  }

  // 3. Validar transición según flujo de negocio (sin roles)
  const allowed = VALID_TRANSITIONS[order.status as OrderStatus] ?? [];
  if (!allowed.includes(nextStatus)) {
    return {
      ok: false,
      error: `No se puede pasar de ${STATUS_LABELS[order.status as OrderStatus] ?? order.status} a ${STATUS_LABELS[nextStatus] ?? nextStatus}.`,
    };
  }

  // 4. Aplicar (update payload: status + delivered_at si es COMPLETADO)
  const updatePayload: {
    status: OrderStatus;
    delivered_at?: string | null;
  } = { status: nextStatus };

  if (nextStatus === 'COMPLETADO') {
    updatePayload.delivered_at = new Date().toISOString();
  }

  let { error: updateError } = await supabase
    .from('orders')
    .update(updatePayload)
    .eq('id', orderId);

  if (updateError && (updateError as { code?: string }).code === '23514') {
    console.error(`[DataIntegrity] Violación de restricción en orden ${orderId}:`, updateError);
    return {
      ok: false,
      error: 'La orden contiene inconsistencias de datos. Contacta a soporte técnico.',
    };
  }

  if (updateError) {
    console.error('updateOrderStatus/update:', updateError);
    return { ok: false, error: parsePostgrestError(updateError, 'No se pudo actualizar la orden. Inténtalo de nuevo.') };
  }

  // Registrar auditoría de la acción
  logAudit({
    locationId: staff.location_id,
    staffId: staff.id,
    action: 'UPDATE_ORDER_STATUS',
    resourceType: 'order',
    resourceId: orderId,
    metadata: { previousStatus: order.status, newStatus: nextStatus },
  });

  return { ok: true };
}