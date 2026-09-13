// Acceso al catálogo (server). Usa el cliente anónimo para respetar RLS del menú público.

'use server';

import { createAnonServerClient } from '@/lib/supabase/server';
import type { Category, Product, ModifierGroup, ModifierOption } from '@/lib/types';

export async function getMenu(locationId: string): Promise<{ categories: Category[]; products: Product[] }> {
  const supabase = createAnonServerClient();

  const [catRes, prodRes, groupRes, optRes] = await Promise.all([
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

  if (catRes.error || prodRes.error || groupRes.error || optRes.error) {
    throw new Error('Error al cargar el menú');
  }

  const groupsMap = new Map<string, ModifierGroup>();
  for (const g of (groupRes.data ?? []) as ModifierGroup[]) {
    groupsMap.set(g.id, { ...g, options: [] });
  }
  for (const o of (optRes.data ?? []) as ModifierOption[]) {
    const g = groupsMap.get(o.modifier_group_id);
    if (g) g.options.push(o);
  }

  const products = (prodRes.data ?? []).map((p) => ({
    ...(p as Product),
    modifier_groups: (p.modifier_groups ?? []).length
      ? p.modifier_groups
      : Array.from(groupsMap.values()).filter((g) => g.product_id === p.id),
  }));

  return { categories: catRes.data ?? [], products };
}