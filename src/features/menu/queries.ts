// Acceso al catálogo (server). Usa el cliente anónimo para respetar RLS del menú público.

'use server';

import { createAnonServerClient, createServerClient } from '@/lib/supabase/server';
import { locationScoped } from '@/lib/server/scoped-query';
import { describeSupabaseError } from '@/lib/errors';
import type { Category, Product, ModifierGroup, ModifierOption } from '@/lib/types';

export async function getProductsAvailability(
  locationId: string,
  productIds: string[]
): Promise<{ ok: boolean; availability: Record<string, boolean> }> {
  if (!locationId || productIds.length === 0) {
    return { ok: true, availability: {} };
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await locationScoped(supabase, 'products', locationId)
      .select('id, is_available')
      .in('id', productIds);

    if (error || !data) {
      console.error('getProductsAvailability:', describeSupabaseError(error));
      return { ok: false, availability: {} };
    }

    const availability: Record<string, boolean> = {};
    for (const row of data as unknown as { id: string; is_available: boolean }[]) {
      availability[row.id] = Boolean(row.is_available);
    }
    // Si algún ID solicitado ya fue eliminado del catálogo, marcarlo no disponible
    for (const id of productIds) {
      if (!(id in availability)) {
        availability[id] = false;
      }
    }

    return { ok: true, availability };
  } catch (err) {
    console.error('getProductsAvailability error:', describeSupabaseError(err));
    return { ok: false, availability: {} };
  }
}

export async function getMenu(locationId: string): Promise<{ categories: Category[]; products: Product[] }> {
  const supabase = createAnonServerClient(locationId);

  // Cargas independientes: un fallo en modificadores no debe esconder todo el menú.
  const [catRes, prodRes, groupRes, optRes] = await Promise.allSettled([
    supabase
      .from('categories')
      .select('*')
      .eq('location_id', locationId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('products')
      .select('*')
      .eq('location_id', locationId)
      .eq('is_available', true)
      .order('name', { ascending: true }),
    supabase.from('modifier_groups').select('*').eq('location_id', locationId),
    supabase
      .from('modifier_options')
      .select('*')
      .eq('location_id', locationId)
      .eq('is_active', true),
  ]);

  const categories = catRes.status === 'fulfilled' && !catRes.value.error ? (catRes.value.data ?? []) : [];
  const rawProducts = prodRes.status === 'fulfilled' && !prodRes.value.error ? (prodRes.value.data ?? []) : [];
  const rawGroups = groupRes.status === 'fulfilled' && !groupRes.value.error ? (groupRes.value.data ?? []) : [];
  const rawOptions = optRes.status === 'fulfilled' && !optRes.value.error ? (optRes.value.data ?? []) : [];

  // Loguear con descripción serializada: el overlay de Next muestra los
  // errores crudos como `{}`, ocultando la causa (ej: 42501 permission denied).
  if (catRes.status === 'rejected' || (catRes.status === 'fulfilled' && catRes.value.error)) {
    console.error('getMenu: fallo cargando categories:', describeSupabaseError(catRes.status === 'rejected' ? catRes.reason : catRes.value.error));
  }
  if (prodRes.status === 'rejected' || (prodRes.status === 'fulfilled' && prodRes.value.error)) {
    console.error('getMenu: fallo cargando products:', describeSupabaseError(prodRes.status === 'rejected' ? prodRes.reason : prodRes.value.error));
  }
  if (groupRes.status === 'rejected' || (groupRes.status === 'fulfilled' && groupRes.value.error)) {
    console.error('getMenu: fallo cargando modifier_groups (menú sigue visible sin modificadores):', describeSupabaseError(groupRes.status === 'rejected' ? groupRes.reason : groupRes.value.error));
  }
  if (optRes.status === 'rejected' || (optRes.status === 'fulfilled' && optRes.value.error)) {
    console.error('getMenu: fallo cargando modifier_options (menú sigue visible sin modificadores):', describeSupabaseError(optRes.status === 'rejected' ? optRes.reason : optRes.value.error));
  }

  const groupsMap = new Map<string, ModifierGroup>();
  for (const g of rawGroups as ModifierGroup[]) {
    groupsMap.set(g.id, { ...g, options: [] });
  }
  for (const o of rawOptions as ModifierOption[]) {
    const g = groupsMap.get(o.modifier_group_id);
    if (g) g.options.push(o);
  }

  const products = rawProducts.map((p) => ({
    ...(p as Product),
    modifier_groups: (p.modifier_groups ?? []).length
      ? p.modifier_groups
      : Array.from(groupsMap.values()).filter((g) => g.product_id === p.id),
  }));

  return { categories: categories as Category[], products };
}