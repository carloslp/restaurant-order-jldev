// Server actions for order tracking (client and repartidor)

'use server';

import { createServerClient } from '@/lib/supabase/server';
import { verifyToken } from '@/lib/tokens';
import type { Order } from '@/lib/types';

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

  // 1. Find the delivery token record that matches the plain token (via hash) and is not used/revoked/expired
  const { data: tokenRecord, error: tokenError } = await supabase
    .from('delivery_tokens')
    .select('*, orders!inner(id, status, delivery_token_expires_at)')
    .eq('used_at', null)
    .eq('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (tokenError || !tokenRecord) {
    return { ok: false, error: 'Token inválido, usado, revocado o expirado' };
  }

  // 2. Verify the plain token against the hash (using bcrypt)
  if (!verifyToken(plainToken, tokenRecord.token_hash)) {
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
    // We could log this, but the order is already marked as delivered.
    // For simplicity, we still return success.
    console.error('Error marking delivery token as used:', tokenUpdateError);
  }

  return {
    ok: true,
    orderId: updatedOrder.id,
  };
}