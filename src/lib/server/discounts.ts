// src/lib/server/discounts.ts
import { createClient } from '@/lib/supabase/server';
import { DiscountSchema } from '@/lib/validation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

export async function listDiscounts() {
  const supabase = await createClient();
  
  // The RLS policy discounts_staff_access handles location_id filtering
  const { data, error } = await supabase
    .from('discounts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Error listing discounts: ${error.message}`);
  return data;
}

export async function createDiscount(payload: z.infer<typeof DiscountSchema>) {
  const supabase = await createClient();
  
  // Get current local_id from GUC/session (handled by server helper)
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
  const supabase = await createClient();
  
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
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('discounts')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Error deleting discount: ${error.message}`);
  
  revalidatePath('/staff/admin');
  return { success: true };
}

export async function toggleDiscountStatus(id: string, is_active: boolean) {
  const supabase = await createClient();
  
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
