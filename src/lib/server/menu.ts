// src/lib/server/menu.ts
'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getCurrentStaff } from '@/app/staff/page';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import type { Category, Product } from '@/lib/types';

// --- Schemas ---

// image_url: el form manda "" cuando no hay imagen → se normaliza a null;
// un valor no vacío debe ser URL válida (pública del bucket o externa).
const imageUrlSchema = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().url('URL de imagen inválida').nullable().optional()
);

const CategorySchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  description: z.string().nullish(),
  image_url: imageUrlSchema,
  is_active: z.boolean().default(true),
  sort_order: z.number().int().min(0).default(0),
});

const ProductSchema = z.object({
  category_id: z.string().uuid('Categoría inválida'),
  name: z.string().min(1, 'El nombre es requerido'),
  description: z.string().nullish(),
  image_url: imageUrlSchema,
  base_price: z.number().positive('El precio debe ser mayor a 0'),
  is_available: z.boolean().default(true),
  allergens: z.array(z.string()).optional(),
  diet_labels: z.array(z.string()).optional(),
});

// --- Helpers ---
async function getStaffContext() {
  const { staff } = await getCurrentStaff();
  return staff;
}

// --- Categories ---

export async function listCategories(): Promise<Category[]> {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  await supabase.rpc('set_config', {
    name: 'app.local_id',
    value: staff.location_id,
    is_local: true,
  });

  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Category[];
}

export async function createCategory(payload: z.infer<typeof CategorySchema>) {
  const staff = await getStaffContext();
  const validated = CategorySchema.parse(payload);
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('categories')
    .insert({
      ...validated,
      location_id: staff.location_id,
    })
    .select()
    .single();

  if (error) throw error;
  
  revalidatePath('/staff/admin');
  return data as Category;
}

export async function updateCategory(id: string, payload: z.infer<typeof CategorySchema>) {
  const staff = await getStaffContext();
  const validated = CategorySchema.parse(payload);
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('categories')
    .update(validated)
    .eq('id', id)
    .eq('location_id', staff.location_id)
    .select()
    .single();

  if (error) throw error;

  revalidatePath('/staff/admin');
  return data as Category;
}

export async function deleteCategory(id: string) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  // Leer la imagen antes de borrar para limpiarla del bucket (best-effort)
  const { data: category } = await supabase
    .from('categories')
    .select('image_url')
    .eq('id', id)
    .eq('location_id', staff.location_id)
    .maybeSingle();

  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id)
    .eq('location_id', staff.location_id);

  if (error) throw error;

  if (category?.image_url) {
    try {
      await deleteMenuImage(category.image_url as string);
    } catch {
      // best-effort: no bloquear si la imagen ya no existe
    }
  }

  revalidatePath('/staff/admin');
  return { ok: true };
}

// --- Products ---

export async function listProducts(categoryId?: string): Promise<Product[]> {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  await supabase.rpc('set_config', {
    name: 'app.local_id',
    value: staff.location_id,
    is_local: true,
  });

  let query = supabase
    .from('products')
    .select('*, modifier_groups(id, name, is_required, min_selections, max_selections, options:modifier_options(id, name, price_impact, is_active))')
    .order('name', { ascending: true });

  if (categoryId) {
    query = query.eq('category_id', categoryId);
  }

  const { data, error } = await query;

  if (error) throw error;

  const products = (data ?? []) as any as Product[];
  if (products.length === 0) return products;

  // Enriquecer con alérgenos y etiquetas dietarias (tablas puente).
  const productIds = products.map((p) => p.id);
  const [aRes, dRes] = await Promise.all([
    supabase
      .from('product_allergens')
      .select('product_id, allergens(name)')
      .in('product_id', productIds),
    supabase
      .from('product_diet_labels')
      .select('product_id, diet_labels(name)')
      .in('product_id', productIds),
  ]);

  if (aRes.error) throw aRes.error;
  if (dRes.error) throw dRes.error;

  const allergensByProduct = new Map<string, string[]>();
  for (const row of (aRes.data ?? []) as any[]) {
    const name = row.allergens?.name;
    if (!name) continue;
    const list = allergensByProduct.get(row.product_id) ?? [];
    list.push(name);
    allergensByProduct.set(row.product_id, list);
  }
  const dietLabelsByProduct = new Map<string, string[]>();
  for (const row of (dRes.data ?? []) as any[]) {
    const name = row.diet_labels?.name;
    if (!name) continue;
    const list = dietLabelsByProduct.get(row.product_id) ?? [];
    list.push(name);
    dietLabelsByProduct.set(row.product_id, list);
  }

  return products.map((p) => ({
    ...p,
    allergens: allergensByProduct.get(p.id) ?? [],
    diet_labels: dietLabelsByProduct.get(p.id) ?? [],
  }));
}

// `allergens`/`diet_labels` del form son nombres; las tablas puente guardan IDs.
type ServerSupabase = ReturnType<typeof createServerClient>;

async function resolveAllergenIds(supabase: ServerSupabase, names: string[]): Promise<string[]> {
  if (names.length === 0) return [];
  const { data, error } = await supabase.from('allergens').select('id, name').in('name', names);
  if (error) throw error;
  const found = new Map((data ?? []).map((a: any) => [a.name, a.id]));
  const missing = names.filter((n) => !found.has(n));
  if (missing.length > 0) throw new Error(`Alérgenos desconocidos: ${missing.join(', ')}`);
  return names.map((n) => found.get(n));
}

async function resolveDietLabelIds(supabase: ServerSupabase, names: string[]): Promise<string[]> {
  if (names.length === 0) return [];
  const { data, error } = await supabase.from('diet_labels').select('id, name').in('name', names);
  if (error) throw error;
  const found = new Map((data ?? []).map((d: any) => [d.name, d.id]));
  const missing = names.filter((n) => !found.has(n));
  if (missing.length > 0) throw new Error(`Etiquetas dietarias desconocidas: ${missing.join(', ')}`);
  return names.map((n) => found.get(n));
}

// Sincroniza los puentes product_allergens / product_diet_labels (reemplazo total).
async function syncProductLabels(
  supabase: ServerSupabase,
  productId: string,
  allergens: string[] | undefined,
  dietLabels: string[] | undefined
) {
  if (allergens !== undefined) {
    const { error: delErr } = await supabase.from('product_allergens').delete().eq('product_id', productId);
    if (delErr) throw delErr;
    const ids = await resolveAllergenIds(supabase, allergens);
    if (ids.length > 0) {
      const { error: insErr } = await supabase
        .from('product_allergens')
        .insert(ids.map((allergen_id) => ({ product_id: productId, allergen_id })));
      if (insErr) throw insErr;
    }
  }
  if (dietLabels !== undefined) {
    const { error: delErr } = await supabase.from('product_diet_labels').delete().eq('product_id', productId);
    if (delErr) throw delErr;
    const ids = await resolveDietLabelIds(supabase, dietLabels);
    if (ids.length > 0) {
      const { error: insErr } = await supabase
        .from('product_diet_labels')
        .insert(ids.map((diet_label_id) => ({ product_id: productId, diet_label_id })));
      if (insErr) throw insErr;
    }
  }
}

export async function createProduct(payload: z.infer<typeof ProductSchema>) {
  const staff = await getStaffContext();
  const validated = ProductSchema.parse(payload);
  const supabase = createServerClient();

  // La categoría debe pertenecer a este local (error claro en vez de FK/RLS).
  const { data: category } = await supabase
    .from('categories')
    .select('id')
    .eq('id', validated.category_id)
    .eq('location_id', staff.location_id)
    .maybeSingle();
  if (!category) throw new Error('Categoría inválida o no pertenece a este local');

  // `allergens`/`diet_labels` no son columnas de `products`: van a tablas puente.
  const { allergens, diet_labels, ...productFields } = validated;

  const { data, error } = await supabase
    .from('products')
    .insert({
      ...productFields,
      location_id: staff.location_id,
    })
    .select()
    .single();

  if (error) throw error;

  await syncProductLabels(supabase, data.id, allergens, diet_labels);

  revalidatePath('/staff/admin');
  return { ...data, allergens: allergens ?? [], diet_labels: diet_labels ?? [] } as Product;
}

export async function updateProduct(id: string, payload: z.infer<typeof ProductSchema>) {
  const staff = await getStaffContext();
  const validated = ProductSchema.parse(payload);
  const supabase = createServerClient();

  // La categoría debe pertenecer a este local.
  const { data: category } = await supabase
    .from('categories')
    .select('id')
    .eq('id', validated.category_id)
    .eq('location_id', staff.location_id)
    .maybeSingle();
  if (!category) throw new Error('Categoría inválida o no pertenece a este local');

  // `allergens`/`diet_labels` no son columnas de `products`: van a tablas puente.
  const { allergens, diet_labels, ...productFields } = validated;

  const { data, error } = await supabase
    .from('products')
    .update(productFields)
    .eq('id', id)
    .eq('location_id', staff.location_id)
    .select()
    .single();

  if (error) throw error;

  await syncProductLabels(supabase, id, allergens, diet_labels);

  revalidatePath('/staff/admin');
  return data as Product;
}

export async function deleteProduct(id: string) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  // Leer la imagen antes de borrar para limpiarla del bucket (best-effort)
  const { data: product } = await supabase
    .from('products')
    .select('image_url')
    .eq('id', id)
    .eq('location_id', staff.location_id)
    .maybeSingle();

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id)
    .eq('location_id', staff.location_id);

  if (error) throw error;

  if (product?.image_url) {
    try {
      await deleteMenuImage(product.image_url as string);
    } catch {
      // best-effort: no bloquear si la imagen ya no existe
    }
  }

  revalidatePath('/staff/admin');
  return { ok: true };
}

// --- Modifier Groups ---

const ModifierGroupSchema = z.object({
  product_id: z.string().uuid('Producto inválido'),
  name: z.string().min(1, 'El nombre es requerido'),
  is_required: z.boolean().default(true),
  min_selections: z.number().int().min(0).default(0),
  max_selections: z.number().int().min(0).default(0),
});

const ModifierOptionSchema = z.object({
  modifier_group_id: z.string().uuid('Grupo de modificadores inválido'),
  name: z.string().min(1, 'El nombre es requerido'),
  price_impact: z.number().default(0),
  is_active: z.boolean().default(true),
});

export async function listModifierGroups(productId: string) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  await supabase.rpc('set_config', {
    name: 'app.local_id',
    value: staff.location_id,
    is_local: true,
  });

  // Verify product belongs to this location
  const { data: product } = await supabase
    .from('products')
    .select('id')
    .eq('id', productId)
    .eq('location_id', staff.location_id)
    .single();

  if (!product) throw new Error('Producto no encontrado');

  const { data, error } = await supabase
    .from('modifier_groups')
    .select('*, options:modifier_options(*)')
    .eq('product_id', productId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

export async function createModifierGroup(payload: z.infer<typeof ModifierGroupSchema>) {
  const staff = await getStaffContext();
  const validated = ModifierGroupSchema.parse(payload);
  const supabase = createServerClient();

  // Verify product belongs to this location
  const { data: product } = await supabase
    .from('products')
    .select('id')
    .eq('id', validated.product_id)
    .eq('location_id', staff.location_id)
    .single();

  if (!product) throw new Error('Producto no encontrado');

  const { data, error } = await supabase
    .from('modifier_groups')
    .insert({ ...validated, location_id: staff.location_id })
    .select('*, options:modifier_options(*)')
    .single();

  if (error) throw error;

  revalidatePath('/staff/admin');
  return data;
}

export async function updateModifierGroup(id: string, payload: z.infer<typeof ModifierGroupSchema>) {
  const staff = await getStaffContext();
  const validated = ModifierGroupSchema.parse(payload);
  const supabase = createServerClient();

  // Verify ownership through product
  const { data: group } = await supabase
    .from('modifier_groups')
    .select('product_id, products!inner(location_id)')
    .eq('id', id)
    .single();

  if (!group || (group as any).products.location_id !== staff.location_id) {
    throw new Error('No autorizado');
  }

  const { data, error } = await supabase
    .from('modifier_groups')
    .update(validated)
    .eq('id', id)
    .select('*, options:modifier_options(*)')
    .single();

  if (error) throw error;

  revalidatePath('/staff/admin');
  return data;
}

export async function deleteModifierGroup(id: string) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  // Verify ownership through product
  const { data: group } = await supabase
    .from('modifier_groups')
    .select('product_id, products!inner(location_id)')
    .eq('id', id)
    .single();

  if (!group || (group as any).products.location_id !== staff.location_id) {
    throw new Error('No autorizado');
  }

  const { error } = await supabase
    .from('modifier_groups')
    .delete()
    .eq('id', id);

  if (error) throw error;

  revalidatePath('/staff/admin');
  return { ok: true };
}

// --- Modifier Options ---

export async function createModifierOption(payload: z.infer<typeof ModifierOptionSchema>) {
  const staff = await getStaffContext();
  const validated = ModifierOptionSchema.parse(payload);
  const supabase = createServerClient();

  // Verify ownership through modifier_group -> product
  const { data: group } = await supabase
    .from('modifier_groups')
    .select('product_id, products!inner(location_id)')
    .eq('id', validated.modifier_group_id)
    .single();

  if (!group || (group as any).products.location_id !== staff.location_id) {
    throw new Error('No autorizado');
  }

  const { data, error } = await supabase
    .from('modifier_options')
    .insert({ ...validated, location_id: staff.location_id })
    .select()
    .single();

  if (error) throw error;

  revalidatePath('/staff/admin');
  return data;
}

export async function updateModifierOption(id: string, payload: z.infer<typeof ModifierOptionSchema>) {
  const staff = await getStaffContext();
  const validated = ModifierOptionSchema.parse(payload);
  const supabase = createServerClient();

  // Verify ownership
  const { data: option } = await supabase
    .from('modifier_options')
    .select('modifier_group_id, modifier_groups!inner(product_id, products!inner(location_id))')
    .eq('id', id)
    .single();

  if (!option || (option as any).modifier_groups.products.location_id !== staff.location_id) {
    throw new Error('No autorizado');
  }

  const { data, error } = await supabase
    .from('modifier_options')
    .update(validated)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  revalidatePath('/staff/admin');
  return data;
}

export async function deleteModifierOption(id: string) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  // Verify ownership
  const { data: option } = await supabase
    .from('modifier_options')
    .select('modifier_group_id, modifier_groups!inner(product_id, products!inner(location_id))')
    .eq('id', id)
    .single();

  if (!option || (option as any).modifier_groups.products.location_id !== staff.location_id) {
    throw new Error('No autorizado');
  }

  const { error } = await supabase
    .from('modifier_options')
    .delete()
    .eq('id', id);

  if (error) throw error;

  revalidatePath('/staff/admin');
  return { ok: true };
}

// --- Image Upload ---

export async function uploadMenuImage(file: File, folder: 'categories' | 'products'): Promise<string> {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Tipo de archivo no permitido. Use JPEG, PNG o WebP.');
  }

  // Validate file size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('El archivo supera el tamaño máximo de 5MB.');
  }

  const fileExt = file.type.split('/')[1];
  const fileName = `${crypto.randomUUID()}.${fileExt}`;
  const filePath = `${staff.location_id}/${folder}/${fileName}`;

  const { error } = await supabase.storage
    .from('menu-images')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage.from('menu-images').getPublicUrl(filePath);
  return data.publicUrl;
}

export async function deleteMenuImage(publicUrl: string): Promise<{ ok: boolean }> {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  // Extract path from public URL
  const url = new URL(publicUrl);
  const pathMatch = url.pathname.match(new RegExp('/menu-images/(.+)$'));
  if (!pathMatch) throw new Error('URL de imagen inválida');

  const filePath = pathMatch[1];

  // Verify the file belongs to this location
  if (!filePath.startsWith(`${staff.location_id}/`)) {
    throw new Error('No autorizado para eliminar esta imagen');
  }

  const { error } = await supabase.storage.from('menu-images').remove([filePath]);

  if (error) throw error;

  return { ok: true };
}
