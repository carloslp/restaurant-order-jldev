'use server';

// src/lib/server/discounts.ts
import { createServerClient } from '@/lib/supabase/server';
import { DiscountSchema } from '@/lib/validation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

export async function listDiscounts() {
  const supabase = await createServerClient();
  
  const { data, error } = await supabase
    .from('discounts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Error listing discounts: ${error.message}`);
  return data;
}

export async function createDiscount(payload: z.infer<typeof DiscountSchema>) {
  const supabase = await createServerClient();
  
  const { data: local } = await supabase
    .from('locals')
    .select('id')
    .single();

  if (!local) throw new Error('No local associated with this session');

  const validated = DiscountSchema.parse(payload);
  
  const { data, error } = await supabase
    .from('discounts')
    .insert({
      ...validated,
      location_id: local.id,
    })
    .select()
    .single();

  if (error) throw new Error(`Error creating discount: ${error.message}`);
  
  revalidatePath('/staff/admin');
  return data;
}

export async function updateDiscount(id: string, payload: z.infer<typeof DiscountSchema>) {
  const supabase = await createServerClient();
  
  const validated = DiscountSchema.parse(payload);
  
  const { data, error } = await supabase
    .from('discounts')
    .update(validated)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Error updating discount: ${error.message}`);
  
  revalidatePath('/staff/admin');
  return data;
}

export async function deleteDiscount(id: string) {
  const supabase = await createServerClient();
  
  const { error } = await supabase
    .from('discounts')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Error deleting discount: ${error.message}`);
  
  revalidatePath('/staff/admin');
  return { success: true };
}

export async function toggleDiscountStatus(id: string, is_active: boolean) {
  const supabase = await createServerClient();
  
  const { data, error } = await supabase
    .from('discounts')
    .update({ is_active })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Error toggling discount status: ${error.message}`);
  
  revalidatePath('/staff/admin');
  return data;
}

export async function applyManualDiscount(orderId: string, amount: number, reason: string) {
  const supabase = await createServerClient();
  
  // 1. Get order to find location_id and current total
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (orderError || !order) throw new Error('Orden no encontrada');

  // 2. Find a "Manual Discount" template or just create a usage.
  // For simplicity, we'll look for an active discount marked as 'MANUAL' 
  // or we create a generic one if it doesn't exist.
  const { data: manualDiscount, error: discError } = await supabase
    .from('discounts')
    .select('id')
    .eq('location_id', order.location_id)
    .eq('description', 'Descuento Manual')
    .eq('is_active', true)
    .maybeSingle();

  let discountId = manualDiscount?.id;

  if (!discountId) {
    const { data: newDisc, error: createError } = await supabase
      .from('discounts')
      .insert({
        location_id: order.location_id,
        description: 'Descuento Manual',
        discount_type: 'FIXED_AMOUNT',
        value: 0, // Template value
        is_active: true,
      })
      .select()
      .single();
    if (createError) throw new Error(`Error creando plantilla manual: ${createError.message}`);
    discountId = newDisc.id;
  }

  // 3. Record the usage
  const { error: usageError } = await supabase
    .from('discount_usages')
    .insert({
      discount_id: discountId,
      order_id: orderId,
      customer_phone: order.customer_phone,
      amount_applied: amount,
    });

  if (usageError) throw new Error(`Error registrando descuento manual: ${usageError.message}`);

  // 4. Update order total
  const newTotal = Math.max(0, order.total - amount);
  const { error: updateError } = await supabase
    .from('orders')
    .update({ total: newTotal })
    .eq('id', orderId);

  if (updateError) throw new Error(`Error actualizando total de orden: ${updateError.message}`);

  revalidatePath('/staff/caja');
  return { success: true, newTotal };
}
