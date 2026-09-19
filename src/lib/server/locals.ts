'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getCurrentStaff } from '@/app/staff/page';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { locationSlugSchema } from '@/lib/slugs';

// --- Schemas ---

const LocalSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  slug: locationSlugSchema,
  timezone: z.string().default('America/Mexico_City'),
  iva_rate: z.number().min(0).max(1).default(0.16),
  delivery_fee: z.number().min(0).default(0),
});

// --- Helpers ---

async function getStaffContext() {
  const { staff } = await getCurrentStaff();
  // No role check - any staff can proceed
  return staff;
}

function setLocationGUC(supabase: ReturnType<typeof createServerClient>, locationId: string) {
  return supabase.rpc('set_config', {
    name: 'app.local_id',
    value: locationId,
    is_local: true,
  });
}

// --- Locals Server Actions ---

export async function listLocals(): Promise<Array<{
  id: string;
  name: string;
  slug: string;
  timezone: string;
  iva_rate: number;
  delivery_fee: number;
  created_at: string;
  updated_at: string;
}>> {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  await setLocationGUC(supabase, staff.location_id);

  const { data, error } = await supabase
    .from('locals')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Array<{
    id: string;
    name: string;
    slug: string;
    timezone: string;
    iva_rate: number;
    delivery_fee: number;
    created_at: string;
    updated_at: string;
  }>;
}

export async function createLocal(payload: z.infer<typeof LocalSchema>) {
  const staff = await getStaffContext();
  const validated = LocalSchema.parse(payload);
  const supabase = createServerClient();

  // Verificar que la ruta no exista ya
  const { data: existing } = await supabase
    .from('locals')
    .select('id')
    .eq('slug', validated.slug)
    .maybeSingle();

  if (existing) {
    throw new Error('Ya existe un local con esa ruta');
  }

  const { data, error } = await supabase
    .from('locals')
    .insert({
      name: validated.name,
      slug: validated.slug,
      timezone: validated.timezone,
      iva_rate: validated.iva_rate,
      delivery_fee: validated.delivery_fee,
      created_by: staff.id,
    })
    .select()
    .single();

  if (error) throw error;

  revalidatePath('/staff/admin');
  return data;
}

export async function updateLocal(id: string, payload: z.infer<typeof LocalSchema>) {
  const staff = await getStaffContext();
  const validated = LocalSchema.parse(payload);
  const supabase = createServerClient();

  // Verificar que la ruta no exista en otro local
  const { data: existing } = await supabase
    .from('locals')
    .select('id')
    .eq('slug', validated.slug)
    .neq('id', id)
    .maybeSingle();

  if (existing) {
    throw new Error('Ya existe otro local con esa ruta');
  }

  const { data, error } = await supabase
    .from('locals')
    .update({
      name: validated.name,
      slug: validated.slug,
      timezone: validated.timezone,
      iva_rate: validated.iva_rate,
      delivery_fee: validated.delivery_fee,
      updated_by: staff.id,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  revalidatePath('/staff/admin');
  return data;
}

export async function deleteLocal(id: string) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  // No permitir eliminar el local actual del staff
  const { data: currentLocal } = await supabase
    .from('locals')
    .select('id')
    .eq('id', staff.location_id)
    .single();

  if (currentLocal?.id === id) {
    throw new Error('No puedes eliminar el local al que actualmente perteneces');
  }

  const { error } = await supabase
    .from('locals')
    .delete()
    .eq('id', id);

  if (error) throw error;

  revalidatePath('/staff/admin');
}

export async function getLocalById(id: string): Promise<{
  id: string;
  name: string;
  slug: string;
  timezone: string;
  iva_rate: number;
  delivery_fee: number;
  created_at: string;
  updated_at: string;
} | null> {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  await setLocationGUC(supabase, staff.location_id);

  const { data } = await supabase
    .from('locals')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    timezone: data.timezone,
    iva_rate: Number(data.iva_rate),
    delivery_fee: Number(data.delivery_fee ?? 0),
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}