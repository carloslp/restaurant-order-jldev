'use server';

// src/lib/server/discounts.ts
import { createServerClient } from '@/lib/supabase/server';
import { DiscountSchema } from '@/lib/validation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentStaff } from '@/app/staff/page';
import { AppError, parseOrThrow, parsePostgrestError, queryOrThrow } from '@/lib/errors';
import type { Discount } from '@/lib/types';

async function getStaffContext() {
  const { staff } = await getCurrentStaff();
  return staff;
}

function setLocationGUC(supabase: ReturnType<typeof createServerClient>, locationId: string) {
  return supabase.rpc('set_config', {
    name: 'app.local_id',
    value: locationId,
    is_local: true,
  });
}

export async function listDiscounts(): Promise<Discount[]> {
  const staff = await getStaffContext();
  const supabase = await createServerClient();

  await setLocationGUC(supabase, staff.location_id);

  const { data, error } = await supabase
    .from('discounts')
    .select('id, location_id, code, description, discount_type, value, min_purchase, applies_to_product_ids, applies_to_category_ids, starts_at, ends_at, days_of_week, time_of_day_start, time_of_day_end, usage_limit_total, usage_limit_per_customer, usage_limit_per_day, is_active, created_at, updated_at, created_by')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Error listing discounts: ${error.message}`);
  return (data ?? []) as unknown as Discount[];
}

export async function createDiscount(payload: z.infer<typeof DiscountSchema>) {
  const staff = await getStaffContext();
  const supabase = await createServerClient();

  const validated = parseOrThrow(DiscountSchema, payload);

  const data = await queryOrThrow(
    supabase
      .from('discounts')
      .insert({
        ...validated,
        location_id: staff.location_id,
      })
      .select()
      .single(),
    { action: 'createDiscount', fallback: 'No se pudo crear la promoción. Inténtalo de nuevo.' }
  );

  revalidatePath('/staff/admin');
  return data;
}

export async function updateDiscount(id: string, payload: z.infer<typeof DiscountSchema>) {
  const staff = await getStaffContext();
  const supabase = await createServerClient();

  await setLocationGUC(supabase, staff.location_id);

  const validated = parseOrThrow(DiscountSchema, payload);

  const data = await queryOrThrow(
    supabase
      .from('discounts')
      .update(validated)
      .eq('id', id)
      .eq('location_id', staff.location_id)
      .select()
      .single(),
    { action: 'updateDiscount', fallback: 'No se pudo actualizar la promoción.' }
  );

  revalidatePath('/staff/admin');
  return data;
}

export async function deleteDiscount(id: string) {
  const staff = await getStaffContext();
  const supabase = await createServerClient();

  await setLocationGUC(supabase, staff.location_id);

  const { error } = await supabase
    .from('discounts')
    .delete()
    .eq('id', id)
    .eq('location_id', staff.location_id);

  if (error) {
    console.error('deleteDiscount:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudo eliminar la promoción.'));
  }

  revalidatePath('/staff/admin');
  return { success: true };
}

export async function toggleDiscountStatus(id: string, is_active: boolean) {
  const staff = await getStaffContext();
  const supabase = await createServerClient();

  await setLocationGUC(supabase, staff.location_id);

  const data = await queryOrThrow(
    supabase
      .from('discounts')
      .update({ is_active })
      .eq('id', id)
      .eq('location_id', staff.location_id)
      .select()
      .single(),
    { action: 'toggleDiscountStatus', fallback: 'No se pudo cambiar el estado de la promoción.' }
  );

  revalidatePath('/staff/admin');
  return data;
}

export async function applyManualDiscount(orderId: string, amount: number, reason: string) {
  const staff = await getStaffContext();
  const supabase = await createServerClient();

  await setLocationGUC(supabase, staff.location_id);

  const amountParsed = Number(amount);
  if (!Number.isFinite(amountParsed) || amountParsed <= 0) {
    throw new AppError('Ingresa un monto de descuento válido mayor a 0.');
  }

  // 1. Get order to find location_id and current total
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, location_id, customer_phone, subtotal, iva_amount, delivery_fee_amount, total')
    .eq('id', orderId)
    .eq('location_id', staff.location_id)
    .single();

  if (orderError || !order) throw new AppError('Orden no encontrada. Es posible que ya haya sido eliminada.');

  // 2. Find a "Manual Discount" template or just create a usage.
  // For simplicity, we'll look for an active discount marked as 'MANUAL'
  // or we create a generic one if it doesn't exist.
  const { data: manualDiscount, error: discError } = await supabase
    .from('discounts')
    .select('id')
    .eq('location_id', staff.location_id)
    .eq('description', 'Descuento Manual')
    .eq('is_active', true)
    .maybeSingle();

  let discountId = manualDiscount?.id;

  if (!discountId) {
    const newDisc = await queryOrThrow(
      supabase
        .from('discounts')
        .insert({
          location_id: staff.location_id,
          description: 'Descuento Manual',
          discount_type: 'FIXED_AMOUNT',
          value: 0, // Template value
          is_active: true,
        })
        .select()
        .single(),
      { action: 'applyManualDiscount/template', fallback: 'No se pudo aplicar el descuento manual.' }
    );
    discountId = newDisc.id;
  }

  // 3. Record the usage
  const { error: usageError } = await supabase
    .from('discount_usages')
    .insert({
      discount_id: discountId,
      order_id: orderId,
      customer_phone: order.customer_phone,
      amount_applied: amountParsed,
    });

  if (usageError) {
    console.error('applyManualDiscount/usage:', usageError);
    throw new AppError('No se pudo registrar el descuento. Inténtalo de nuevo.');
  }

  // 4. Update order total
  const newTotal = Math.max(0, Number(order.total) - amountParsed);
  const { error: updateError } = await supabase
    .from('orders')
    .update({ total: newTotal })
    .eq('id', orderId)
    .eq('location_id', staff.location_id);

  if (updateError) {
    console.error('applyManualDiscount/total:', updateError);
    throw new AppError('Descuento registrado, pero no se pudo actualizar el total. Revisa la orden.');
  }

  revalidatePath('/staff/caja');
  return { success: true, newTotal };
}
