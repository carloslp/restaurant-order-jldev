'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getCurrentStaff } from '@/app/staff/page';
import { z } from 'zod';
import { revalidatePath, revalidateTag } from 'next/cache';
import { cookies } from 'next/headers';
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
  is_open: z.boolean().default(true).optional(),
  is_catalog_only: z.boolean().default(false).optional(),
  reservations_enabled: z.boolean().default(true).optional(),
  address: z.string().optional().nullable(),
  latitude: z.preprocess((val) => (val === '' || val === null || val === undefined ? null : Number(val)), z.number().optional().nullable()),
  longitude: z.preprocess((val) => (val === '' || val === null || val === undefined ? null : Number(val)), z.number().optional().nullable()),
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
  is_open: boolean;
  is_catalog_only: boolean;
  reservations_enabled: boolean;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
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
  return (data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    slug: d.slug,
    timezone: d.timezone,
    iva_rate: Number(d.iva_rate),
    delivery_fee: Number(d.delivery_fee ?? 0),
    is_open: d.is_open !== false,
    is_catalog_only: Boolean(d.is_catalog_only),
    reservations_enabled: d.reservations_enabled !== false,
    address: d.address ?? null,
    latitude: d.latitude != null ? Number(d.latitude) : null,
    longitude: d.longitude != null ? Number(d.longitude) : null,
    created_at: d.created_at,
    updated_at: d.updated_at,
  }));
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

  const insertData: Record<string, unknown> = {
    name: validated.name,
    slug: validated.slug,
    timezone: validated.timezone,
    iva_rate: validated.iva_rate,
    delivery_fee: validated.delivery_fee,
    address: validated.address ?? null,
    latitude: validated.latitude ?? null,
    longitude: validated.longitude ?? null,
  };
  if (validated.is_open !== undefined) {
    insertData.is_open = validated.is_open;
  }

  let { data, error } = await supabase
    .from('locals')
    .insert(insertData)
    .select()
    .single();

  if (error && (error.code === '42703' || error.message?.includes('is_open'))) {
    delete insertData.is_open;
    const retry = await supabase
      .from('locals')
      .insert(insertData)
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error('createLocal:', error);
    throw new AppError('No se pudo crear el local. Inténtalo de nuevo.');
  }

  revalidateTag('locals-list', 'default');
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

  const updateData: Record<string, unknown> = {
    name: validated.name,
    slug: validated.slug,
    timezone: validated.timezone,
    iva_rate: validated.iva_rate,
    delivery_fee: validated.delivery_fee,
    address: validated.address ?? null,
    latitude: validated.latitude ?? null,
    longitude: validated.longitude ?? null,
  };
  if (validated.is_open !== undefined) {
    updateData.is_open = validated.is_open;
  }
  if (validated.is_catalog_only !== undefined) {
    updateData.is_catalog_only = validated.is_catalog_only;
  }
  if (validated.reservations_enabled !== undefined) {
    updateData.reservations_enabled = validated.reservations_enabled;
  }

  let { data, error } = await supabase
    .from('locals')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error && (error.code === '42703' || error.message?.includes('is_open') || error.message?.includes('is_catalog_only') || error.message?.includes('reservations_enabled'))) {
    delete updateData.is_open;
    delete updateData.is_catalog_only;
    delete updateData.reservations_enabled;
    const retry = await supabase
      .from('locals')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error('updateLocal:', error);
    throw new AppError('No se pudo actualizar el local. Verifica que siga existiendo.');
  }

  revalidateTag('locals-list', 'default');
  revalidateTag(`local-${validated.slug}`, 'default');
  revalidateTag(`local-id-${id}`, 'default');
  revalidatePath('/staff/admin');
  return data;
}

export async function toggleLocalOpenStatus(localId: string, isOpen: boolean) {
  await getStaffContext();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('locals')
    .update({ is_open: isOpen })
    .eq('id', localId)
    .select('id, name, slug')
    .single();

  if (error) {
    if (error.code === '42703' || error.message?.includes('is_open')) {
      console.warn('locals.is_open no existe aún en la base de datos.');
      throw new AppError(
        'La columna is_open no existe en la base de datos. Por favor ejecuta el script docs/install.sql en Supabase SQL Editor.'
      );
    }
    console.error('toggleLocalOpenStatus:', error);
    throw new AppError('No se pudo cambiar el estado del local.');
  }

  revalidateTag('locals-list', 'default');
  revalidateTag(`local-id-${localId}`, 'default');
  if (data?.slug) {
    revalidateTag(`local-${data.slug}`, 'default');
  }
  revalidatePath('/staff');
  revalidatePath('/staff/admin');
  revalidatePath('/staff/kds');
  revalidatePath('/staff/caja');
  return { ok: true, is_open: isOpen };
}

export async function toggleLocalCatalogMode(localId: string, isCatalogOnly: boolean) {
  await getStaffContext();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('locals')
    .update({ is_catalog_only: isCatalogOnly })
    .eq('id', localId)
    .select('id, name, slug')
    .single();

  if (error) {
    if (error.code === '42703' || error.message?.includes('is_catalog_only')) {
      console.warn('locals.is_catalog_only no existe aún en la base de datos.');
      throw new AppError(
        'La columna is_catalog_only no existe en la base de datos. Por favor ejecuta el script docs/install.sql en Supabase SQL Editor.'
      );
    }
    console.error('toggleLocalCatalogMode:', error);
    throw new AppError('No se pudo cambiar el modo de catálogo del local.');
  }

  revalidateTag(`local-id-${localId}`, 'default');
  if (data?.slug) {
    revalidateTag(`local-${data.slug}`, 'default');
    revalidatePath(`/${data.slug}`);
    revalidatePath(`/${data.slug}/checkout`);
  }
  revalidatePath('/staff');
  revalidatePath('/staff/admin');
  return { ok: true, is_catalog_only: isCatalogOnly };
}

export async function toggleLocalReservationsEnabled(localId: string, enabled: boolean) {
  await getStaffContext();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('locals')
    .update({ reservations_enabled: enabled })
    .eq('id', localId)
    .select('id, name, slug')
    .single();

  if (error) {
    if (error.code === '42703' || error.message?.includes('reservations_enabled')) {
      console.warn('locals.reservations_enabled no existe aún en la base de datos.');
      throw new AppError(
        'La columna reservations_enabled no existe en la base de datos. Por favor ejecuta el script docs/install.sql en Supabase SQL Editor.'
      );
    }
    console.error('toggleLocalReservationsEnabled:', error);
    throw new AppError('No se pudo cambiar el estado de reservaciones del local.');
  }

  revalidateTag(`local-id-${localId}`, 'default');
  if (data?.slug) {
    revalidateTag(`local-${data.slug}`, 'default');
    revalidatePath(`/${data.slug}`);
    revalidatePath(`/${data.slug}/reservar`);
  }
  revalidatePath('/staff');
  revalidatePath('/staff/admin');
  return { ok: true, reservations_enabled: enabled };
}

export async function setActiveStaffLocation(locationId: string) {
  const cookieStore = await cookies();
  cookieStore.set('staff_active_location_id', locationId, {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 días
  });
  revalidatePath('/staff');
  revalidatePath('/staff/admin');
  revalidatePath('/staff/kds');
  revalidatePath('/staff/caja');
  return { ok: true };
}

export async function getActiveStaffLocationId(): Promise<string> {
  const cookieStore = await cookies();
  const active = cookieStore.get('staff_active_location_id')?.value;
  if (active) return active;
  const { staff } = await getCurrentStaff();
  return staff.location_id;
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

  revalidateTag('locals-list', 'default');
  revalidateTag(`local-id-${id}`, 'default');
  revalidatePath('/staff/admin');
}

export async function getLocalById(id: string): Promise<{
  id: string;
  name: string;
  slug: string;
  timezone: string;
  iva_rate: number;
  delivery_fee: number;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
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
    address: data.address ?? null,
    latitude: data.latitude != null ? Number(data.latitude) : null,
    longitude: data.longitude != null ? Number(data.longitude) : null,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export async function geocodeAddressAction(address: string): Promise<{
  ok: boolean;
  coordinates?: { lat: number; lng: number } | null;
  error?: string;
}> {
  try {
    const { geocodeAddressWithOsm } = await import('@/lib/osm/distanceMatrix');
    const coords = await geocodeAddressWithOsm(address);
    if (!coords) {
      return { ok: false, error: 'No se encontraron coordenadas para esta dirección.' };
    }
    return { ok: true, coordinates: coords };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error al geocodificar' };
  }
}