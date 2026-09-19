'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getCurrentStaff } from '@/app/staff/page';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { locationSlugSchema } from '@/lib/slugs';
import { AppError, parseOrThrow, parsePostgrestError, queryOrThrow } from '@/lib/errors';
import { zNumberES } from '@/lib/validation';

// --- Schemas ---

const LocalSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  slug: locationSlugSchema,
  timezone: z.string().default('America/Mexico_City'),
  iva_rate: zNumberES('El IVA debe ser un número').min(0, 'El IVA no puede ser negativo').max(1, 'El IVA no puede ser mayor a 1').default(0.16),
  delivery_fee: zNumberES('La tarifa debe ser un número').min(0, 'La tarifa no puede ser negativa').default(0),
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
  await getStaffContext();
  const validated = parseOrThrow(LocalSchema, payload);
  const supabase = createServerClient();

  // Verificar que la ruta no exista ya
  const { data: existing } = await supabase
    .from('locals')
    .select('id')
    .eq('slug', validated.slug)
    .maybeSingle();

  if (existing) {
    throw new AppError('Ya existe un local con esa ruta.', {
      fieldErrors: { slug: 'Esa ruta ya está en uso, elige otra.' },
    });
  }

  const data = await queryOrThrow(
    supabase
      .from('locals')
      .insert({
        name: validated.name,
        slug: validated.slug,
        timezone: validated.timezone,
        iva_rate: validated.iva_rate,
        delivery_fee: validated.delivery_fee,
      })
      .select()
      .single(),
    { action: 'createLocal', fallback: 'No se pudo crear el local. Inténtalo de nuevo.' }
  );

  revalidatePath('/staff/admin');
  return data;
}

export async function updateLocal(id: string, payload: z.infer<typeof LocalSchema>) {
  await getStaffContext();
  const validated = parseOrThrow(LocalSchema, payload);
  const supabase = createServerClient();

  // Verificar que la ruta no exista en otro local
  const { data: existing } = await supabase
    .from('locals')
    .select('id')
    .eq('slug', validated.slug)
    .neq('id', id)
    .maybeSingle();

  if (existing) {
    throw new AppError('Ya existe otro local con esa ruta.', {
      fieldErrors: { slug: 'Esa ruta ya está en uso, elige otra.' },
    });
  }

  const data = await queryOrThrow(
    supabase
      .from('locals')
      .update({
        name: validated.name,
        slug: validated.slug,
        timezone: validated.timezone,
        iva_rate: validated.iva_rate,
        delivery_fee: validated.delivery_fee,
      })
      .eq('id', id)
      .select()
      .single(),
    { action: 'updateLocal', fallback: 'No se pudo actualizar el local. Verifica que siga existiendo.' }
  );

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
    throw new AppError('No puedes eliminar el local al que actualmente perteneces.');
  }

  const { error } = await supabase
    .from('locals')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('deleteLocal:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudo eliminar el local.'));
  }

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