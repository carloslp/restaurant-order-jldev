// Server actions / queries para órdenes.
// - Cliente: getOrderByDeliveryToken, markOrderAsDeliveredByToken
// - Staff: listOrdersForLocation, updateOrderStatus (con validación de transición)

'use server';

import { createServerClient } from '@/lib/supabase/server';
import { verifyToken } from '@/lib/tokens';
import type { Order, OrderStatus, StaffRole } from '@/lib/types';
import { getCurrentStaff } from '@/app/staff/page';

/**
 * Fetch an order by its delivery_token (UUID string).
 * Used by the client tracking page.
 */
export async function getOrderByDeliveryToken(deliveryToken: string): Promise<Order | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('delivery_token', deliveryToken)
    .single();

  if (error || !data) {
    return null;
  }

  return data as Order;
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
    .select('*, orders!inner(id, status, delivery_token_expires_at)')
    .eq('used_at', null)
    .eq('revoked_at', null)
    .gt('expires_at', new Date().toISOString());

  if (tokenError || !candidates?.length) {
    return { ok: false, error: 'Token inválido, usado, revocado o expirado' };
  }

  // 2. Find the specific token by verifying the plain token against each candidate's hash
  const tokenRecord = candidates.find((c: any) => verifyToken(plainToken, c.token_hash));
  if (!tokenRecord) {
    return { ok: false, error: 'Token inválido' };
  }

  const order = (tokenRecord as any).orders;

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
    .select()
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
    .select('*, orders!inner(*)')
    .eq('used_at', null)
    .eq('revoked_at', null)
    .gt('expires_at', new Date().toISOString());

  if (tokenError || !candidates?.length) {
    return null;
  }

  // 2. Find the specific token by verifying the plain token against each candidate's hash
  const tokenRecord = candidates.find((c: any) => verifyToken(plainToken, c.token_hash));
  if (!tokenRecord) {
    return null;
  }

  // 3. Return the associated order
  return (tokenRecord as any).orders as Order;
}

// ---------------------------------------------------------------------------
// Staff: listar pedidos del local (RLS filtra por app.local_id vía GUC).
// ---------------------------------------------------------------------------

export async function listOrdersForLocation(opts?: {
  statuses?: OrderStatus[];
  limit?: number;
}): Promise<Order[]> {
  const { staff } = await getCurrentStaff();
  const supabase = createServerClient();

  // RLS: current_setting('app.local_id') debe estar seteado.
  // En Server Actions, lo seteamos explícitamente antes de la query.
  await supabase.rpc('set_config', {
    name: 'app.local_id',
    value: staff.location_id,
    is_local: true,
  });

  let query = supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 100);

  if (opts?.statuses?.length) {
    query = query.in('status', opts.statuses);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error listando orders:', error);
    return [];
  }

  return (data ?? []) as Order[];
}

// Matriz de transiciones por rol (del diseño): cocinero solo cocina.
const ALLOWED_TRANSITIONS: Record<StaffRole, Partial<Record<OrderStatus, OrderStatus[]>>> = {
  ADMIN: {
    CREADO: ['CONFIRMADO_CAJA', 'CANCELADO'],
    CONFIRMADO_CAJA: ['EN_PREPARACION', 'CANCELADO'],
    EN_PREPARACION: ['LISTO', 'CANCELADO'],
    LISTO: ['LISTO_PARA_ENTREGA', 'COMPLETADO', 'CANCELADO'],
    LISTO_PARA_ENTREGA: ['COMPLETADO', 'CANCELADO'],
  },
  CAJERO: {
    CREADO: ['CONFIRMADO_CAJA', 'CANCELADO'],
    CONFIRMADO_CAJA: ['EN_PREPARACION', 'CANCELADO'],
    LISTO: ['LISTO_PARA_ENTREGA', 'COMPLETADO', 'CANCELADO'],
    LISTO_PARA_ENTREGA: ['COMPLETADO', 'CANCELADO'],
  },
  COCINERO: {
    CONFIRMADO_CAJA: ['EN_PREPARACION'],
    EN_PREPARACION: ['LISTO'],
  },
  REPARTIDOR: {
    LISTO_PARA_ENTREGA: ['COMPLETADO'],
  },
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
    return { ok: false, error: 'Orden no encontrada' };
  }

  // 2. Validar que sea del mismo local
  if (order.location_id !== staff.location_id) {
    return { ok: false, error: 'No autorizado para esta orden' };
  }

  // 3. Validar transición según rol
  const allowed = ALLOWED_TRANSITIONS[staff.role as StaffRole]?.[order.status as OrderStatus] ?? [];
  if (!allowed.includes(nextStatus)) {
    return {
      ok: false,
      error: `Transición ${order.status} → ${nextStatus} no permitida para tu rol`,
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

  const { error: updateError } = await supabase
    .from('orders')
    .update(updatePayload)
    .eq('id', orderId);

  if (updateError) {
    console.error('Error actualizando orden:', updateError);
    return { ok: false, error: 'No se pudo actualizar la orden' };
  }

  return { ok: true };
}