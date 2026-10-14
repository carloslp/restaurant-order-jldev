// src/lib/server/menu.ts
'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getCurrentStaff } from '@/app/staff/page';
import { z } from 'zod';
import { revalidatePath, revalidateTag } from 'next/cache';
import { AppError, parseOrThrow, parsePostgrestError, queryOrThrow } from '@/lib/errors';
import { zNumberES } from '@/lib/validation';
import type { Category, Product } from '@/lib/types';
import { logAudit } from '@/lib/server/audit';

// --- Schemas ---

// image_url: el form manda "" cuando no hay imagen → se normaliza a null;
// un valor no vacío debe ser URL válida (pública del bucket o externa).
const imageUrlSchema = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().url('URL de imagen inválida').nullable().optional()
);

// Números con coerce: los <input type="number"> mandan string vía Server
// Actions serializadas; sin coerce Zod rechaza y el form devuelve 500.
const CategorySchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  description: z.string().nullish(),
  image_url: imageUrlSchema,
  is_active: z.boolean().default(true),
  sort_order: zNumberES('El orden debe ser un número').int().min(0, 'El orden no puede ser negativo').default(0),
});

const ProductSchema = z.object({
  category_id: z.string().uuid('Categoría inválida'),
  name: z.string().min(1, 'El nombre es requerido'),
  description: z.string().nullish(),
  image_url: imageUrlSchema,
  base_price: zNumberES('El precio debe ser un número').positive('El precio debe ser mayor a 0'),
  is_available: z.boolean().default(true),
  allergens: z.array(z.string()).optional(),
  diet_labels: z.array(z.string()).optional(),
});

// --- Helpers ---
async function getStaffContext() {
  const { staff } = await getCurrentStaff();
  return staff;
}

function invalidateMenu(locationId: string) {
  revalidateTag(`menu-${locationId}`, 'default');
  revalidatePath('/staff/admin');
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
    .select('id, location_id, name, description, image_url, is_active, sort_order, created_at, updated_at')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Category[];
}

export async function createCategory(payload: z.infer<typeof CategorySchema>) {
  const staff = await getStaffContext();
  const validated = parseOrThrow(CategorySchema, payload);
  const supabase = createServerClient();

  const data = await queryOrThrow(
    supabase
      .from('categories')
      .insert({
        ...validated,
        location_id: staff.location_id,
      })
      .select()
      .single(),
    { action: 'createCategory', fallback: 'No se pudo crear la categoría. Inténtalo de nuevo.' }
  );

  invalidateMenu(staff.location_id);
  return data as Category;
}

export async function updateCategory(id: string, payload: z.infer<typeof CategorySchema>) {
  const staff = await getStaffContext();
  const validated = parseOrThrow(CategorySchema, payload);
  const supabase = createServerClient();

  const data = await queryOrThrow(
    supabase
      .from('categories')
      .update(validated)
      .eq('id', id)
      .eq('location_id', staff.location_id)
      .select()
      .single(),
    {
      action: 'updateCategory',
      fallback: 'No se pudo actualizar la categoría. Verifica que siga existiendo.',
    }
  );

  invalidateMenu(staff.location_id);
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

  if (error) {
    console.error('deleteCategory:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudo eliminar la categoría.'));
  }

  if (category?.image_url) {
    try {
      await deleteMenuImage(category.image_url as string);
    } catch {
      // best-effort: no bloquear si la imagen ya no existe
    }
  }

  invalidateMenu(staff.location_id);
  logAudit({
    locationId: staff.location_id,
    staffId: staff.id,
    action: 'DELETE_CATEGORY',
    resourceType: 'category',
    resourceId: id,
  });
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
  const normalized = names.map((n) => n.trim().toUpperCase()).filter(Boolean);
  if (normalized.length === 0) return [];

  const { data } = await supabase.from('allergens').select('id, name').in('name', normalized);
  const found = new Map(((data ?? []) as any[]).map((a: any) => [a.name.toUpperCase(), a.id]));

  const missing = normalized.filter((n) => !found.has(n));
  if (missing.length > 0) {
    const { data: inserted } = await supabase
      .from('allergens')
      .upsert(missing.map((name) => ({ name })), { onConflict: 'name' })
      .select('id, name');
    for (const row of (inserted ?? []) as any[]) {
      found.set(row.name.toUpperCase(), row.id);
    }
  }

  return normalized.map((n) => found.get(n)).filter(Boolean);
}

async function resolveDietLabelIds(supabase: ServerSupabase, names: string[]): Promise<string[]> {
  if (names.length === 0) return [];
  const normalized = names.map((n) => n.trim().toUpperCase()).filter(Boolean);
  if (normalized.length === 0) return [];

  const { data } = await supabase.from('diet_labels').select('id, name').in('name', normalized);
  const found = new Map(((data ?? []) as any[]).map((d: any) => [d.name.toUpperCase(), d.id]));

  const missing = normalized.filter((n) => !found.has(n));
  if (missing.length > 0) {
    const { data: inserted } = await supabase
      .from('diet_labels')
      .upsert(missing.map((name) => ({ name })), { onConflict: 'name' })
      .select('id, name');
    for (const row of (inserted ?? []) as any[]) {
      found.set(row.name.toUpperCase(), row.id);
    }
  }

  return normalized.map((n) => found.get(n)).filter(Boolean);
}

// Sincroniza los puentes product_allergens / product_diet_labels (reemplazo total).
async function syncProductLabels(
  supabase: ServerSupabase,
  productId: string,
  allergens: string[] | undefined,
  dietLabels: string[] | undefined
) {
  const guard = async (promise: PromiseLike<{ error: unknown }>, action: string) => {
    const { error } = await promise;
    if (error) {
      console.error(`${action}:`, error);
      throw new AppError('No se pudieron guardar alérgenos/etiquetas del producto.');
    }
  };
  if (allergens !== undefined) {
    await guard(supabase.from('product_allergens').delete().eq('product_id', productId), 'syncProductLabels/delete-allergens');
    const ids = await resolveAllergenIds(supabase, allergens);
    if (ids.length > 0) {
      await guard(
        supabase
          .from('product_allergens')
          .insert(ids.map((allergen_id) => ({ product_id: productId, allergen_id }))),
        'syncProductLabels/insert-allergens'
      );
    }
  }
  if (dietLabels !== undefined) {
    await guard(supabase.from('product_diet_labels').delete().eq('product_id', productId), 'syncProductLabels/delete-labels');
    const ids = await resolveDietLabelIds(supabase, dietLabels);
    if (ids.length > 0) {
      await guard(
        supabase
          .from('product_diet_labels')
          .insert(ids.map((diet_label_id) => ({ product_id: productId, diet_label_id }))),
        'syncProductLabels/insert-labels'
      );
    }
  }
}

export async function createProduct(payload: z.infer<typeof ProductSchema>) {
  const staff = await getStaffContext();
  const validated = parseOrThrow(ProductSchema, payload);
  const supabase = createServerClient();

  // La categoría debe pertenecer a este local (error claro en vez de FK/RLS).
  const { data: category } = await supabase
    .from('categories')
    .select('id')
    .eq('id', validated.category_id)
    .eq('location_id', staff.location_id)
    .maybeSingle();
  if (!category) {
    throw new AppError('La categoría seleccionada no es válida para este local.', {
      fieldErrors: { category_id: 'Elige una categoría válida de este local.' },
    });
  }

  // `allergens`/`diet_labels` no son columnas de `products`: van a tablas puente.
  const { allergens, diet_labels, ...productFields } = validated;

  const data = await queryOrThrow(
    supabase
      .from('products')
      .insert({
        ...productFields,
        location_id: staff.location_id,
      })
      .select()
      .single(),
    { action: 'createProduct', fallback: 'No se pudo crear el producto. Inténtalo de nuevo.' }
  );

  await syncProductLabels(supabase, data.id, allergens, diet_labels);

  invalidateMenu(staff.location_id);
  return { ...data, allergens: allergens ?? [], diet_labels: diet_labels ?? [] } as Product;
}

export async function updateProduct(id: string, payload: z.infer<typeof ProductSchema>) {
  const staff = await getStaffContext();
  const validated = parseOrThrow(ProductSchema, payload);
  const supabase = createServerClient();

  // La categoría debe pertenecer a este local.
  const { data: category } = await supabase
    .from('categories')
    .select('id')
    .eq('id', validated.category_id)
    .eq('location_id', staff.location_id)
    .maybeSingle();
  if (!category) {
    throw new AppError('La categoría seleccionada no es válida para este local.', {
      fieldErrors: { category_id: 'Elige una categoría válida de este local.' },
    });
  }

  // `allergens`/`diet_labels` no son columnas de `products`: van a tablas puente.
  const { allergens, diet_labels, ...productFields } = validated;

  const data = await queryOrThrow(
    supabase
      .from('products')
      .update(productFields)
      .eq('id', id)
      .eq('location_id', staff.location_id)
      .select()
      .single(),
    { action: 'updateProduct', fallback: 'No se pudo actualizar el producto. Verifica que siga existiendo.' }
  );

  await syncProductLabels(supabase, id, allergens, diet_labels);

  invalidateMenu(staff.location_id);
  return data as Product;
}

export async function toggleProductAvailability(
  productId: string,
  isAvailable: boolean
): Promise<{ ok: boolean; product?: Product; error?: string }> {
  try {
    const staff = await getStaffContext();
    const supabase = createServerClient();

    await supabase.rpc('set_config', {
      name: 'app.local_id',
      value: staff.location_id,
      is_local: true,
    });

    const { data, error } = await supabase
      .from('products')
      .update({ is_available: isAvailable, updated_at: new Date().toISOString() })
      .eq('id', productId)
      .eq('location_id', staff.location_id)
      .select('id, location_id, category_id, name, description, image_url, base_price, is_available')
      .single();

    if (error || !data) {
      console.error('toggleProductAvailability error:', error);
      return {
        ok: false,
        error: 'No se pudo actualizar el estado del platillo',
      };
    }

    // Invalidar caché Next.js del menú público
    revalidateTag(`menu-${staff.location_id}`, 'default');

    // Obtener slug del local para revalidar el menú público y staff
    const { data: local } = await supabase
      .from('locals')
      .select('slug')
      .eq('id', staff.location_id)
      .maybeSingle();

    if (local?.slug) {
      revalidatePath(`/${local.slug}`);
      revalidatePath(`/${local.slug}/checkout`);
    }
    revalidatePath('/staff/kds');
    revalidatePath('/staff/caja');
    revalidatePath('/staff/admin');

    return { ok: true, product: data as Product };
  } catch (err) {
    console.error('toggleProductAvailability catch:', err);
    return {
      ok: false,
      error: 'No se pudo actualizar el estado del platillo',
    };
  }
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

  if (error) {
    console.error('deleteProduct:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudo eliminar el producto.'));
  }

  if (product?.image_url) {
    try {
      await deleteMenuImage(product.image_url as string);
    } catch {
      // best-effort: no bloquear si la imagen ya no existe
    }
  }

  invalidateMenu(staff.location_id);
  logAudit({
    locationId: staff.location_id,
    staffId: staff.id,
    action: 'DELETE_PRODUCT',
    resourceType: 'product',
    resourceId: id,
  });
  return { ok: true };
}

// --- Modifier Groups ---

const ModifierGroupSchema = z.object({
  product_id: z.string().uuid('Producto inválido'),
  name: z.string().min(1, 'El nombre es requerido'),
  is_required: z.boolean().default(true),
  min_selections: zNumberES('El mínimo debe ser un número').int().min(0, 'El mínimo no puede ser negativo').default(0),
  max_selections: zNumberES('El máximo debe ser un número').int().min(0, 'El máximo no puede ser negativo').default(0),
}).refine(
  (data) => data.max_selections === 0 || data.max_selections >= data.min_selections,
  {
    message: 'El máximo de selecciones debe ser 0 (sin límite) o mayor o igual al mínimo.',
    path: ['max_selections'],
  }
);

const ModifierOptionSchema = z.object({
  modifier_group_id: z.string().uuid('Grupo de modificadores inválido'),
  name: z.string().min(1, 'El nombre es requerido'),
  price_impact: zNumberES('El impacto de precio debe ser un número').default(0),
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

  if (!product) throw new AppError('Producto no encontrado.');

  const data = await queryOrThrow(
    supabase
      .from('modifier_groups')
      .select('*, options:modifier_options(*)')
      .eq('product_id', productId)
      .order('created_at', { ascending: true }),
    { action: 'listModifierGroups', fallback: 'No se pudieron cargar los modificadores.' }
  );
  return data;
}

export async function createModifierGroup(payload: z.infer<typeof ModifierGroupSchema>) {
  const staff = await getStaffContext();
  const validated = parseOrThrow(ModifierGroupSchema, payload);
  const supabase = createServerClient();

  // Verify product belongs to this location
  const { data: product } = await supabase
    .from('products')
    .select('id')
    .eq('id', validated.product_id)
    .eq('location_id', staff.location_id)
    .single();

  if (!product) throw new AppError('Producto no encontrado.');

  const data = await queryOrThrow(
    supabase
      .from('modifier_groups')
      .insert({ ...validated, location_id: staff.location_id })
      .select('*, options:modifier_options(*)')
      .single(),
    { action: 'createModifierGroup', fallback: 'No se pudo crear el grupo de modificadores.' }
  );

  invalidateMenu(staff.location_id);
  return data;
}

export async function updateModifierGroup(id: string, payload: z.infer<typeof ModifierGroupSchema>) {
  const staff = await getStaffContext();
  const validated = parseOrThrow(ModifierGroupSchema, payload);
  const supabase = createServerClient();

  // Verify ownership through product
  const { data: group } = await supabase
    .from('modifier_groups')
    .select('product_id, products!inner(location_id)')
    .eq('id', id)
    .single();

  if (!group || (group as any).products.location_id !== staff.location_id) {
    throw new AppError('No tienes acceso a este grupo de modificadores.');
  }

  const data = await queryOrThrow(
    supabase
      .from('modifier_groups')
      .update(validated)
      .eq('id', id)
      .select('*, options:modifier_options(*)')
      .single(),
    { action: 'updateModifierGroup', fallback: 'No se pudo actualizar el grupo de modificadores.' }
  );

  invalidateMenu(staff.location_id);
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
    throw new AppError('No tienes acceso a este grupo de modificadores.');
  }

  const { error } = await supabase
    .from('modifier_groups')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('deleteModifierGroup:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudo eliminar el grupo de modificadores.'));
  }

  invalidateMenu(staff.location_id);
  return { ok: true };
}

// --- Modifier Options ---

export async function createModifierOption(payload: z.infer<typeof ModifierOptionSchema>) {
  const staff = await getStaffContext();
  const validated = parseOrThrow(ModifierOptionSchema, payload);
  const supabase = createServerClient();

  // Verify ownership through modifier_group -> product
  const { data: group } = await supabase
    .from('modifier_groups')
    .select('product_id, products!inner(location_id)')
    .eq('id', validated.modifier_group_id)
    .single();

  if (!group || (group as any).products.location_id !== staff.location_id) {
    throw new AppError('No tienes acceso a este grupo de modificadores.');
  }

  const data = await queryOrThrow(
    supabase
      .from('modifier_options')
      .insert({ ...validated, location_id: staff.location_id })
      .select()
      .single(),
    { action: 'createModifierOption', fallback: 'No se pudo crear la opción.' }
  );

  invalidateMenu(staff.location_id);
  return data;
}

export async function updateModifierOption(id: string, payload: z.infer<typeof ModifierOptionSchema>) {
  const staff = await getStaffContext();
  const validated = parseOrThrow(ModifierOptionSchema, payload);
  const supabase = createServerClient();

  // Verify ownership
  const { data: option } = await supabase
    .from('modifier_options')
    .select('modifier_group_id, modifier_groups!inner(product_id, products!inner(location_id))')
    .eq('id', id)
    .single();

  if (!option || (option as any).modifier_groups.products.location_id !== staff.location_id) {
    throw new AppError('No tienes acceso a esta opción.');
  }

  const data = await queryOrThrow(
    supabase
      .from('modifier_options')
      .update(validated)
      .eq('id', id)
      .select()
      .single(),
    { action: 'updateModifierOption', fallback: 'No se pudo actualizar la opción.' }
  );

  invalidateMenu(staff.location_id);
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
    throw new AppError('No tienes acceso a esta opción.');
  }

  const { error } = await supabase
    .from('modifier_options')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('deleteModifierOption:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudo eliminar la opción.'));
  }

  invalidateMenu(staff.location_id);
  return { ok: true };
}

// --- Image Upload ---

export async function uploadMenuImage(file: File, folder: 'categories' | 'products'): Promise<string> {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    throw new AppError('Tipo de archivo no permitido. Usa JPEG, PNG o WebP.');
  }

  // Validate file size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    throw new AppError('La imagen supera el tamaño máximo de 5MB.');
  }

  const fileExt = file.type.split('/')[1];
  const fileName = `${crypto.randomUUID()}.${fileExt}`;
  const filePath = `${staff.location_id}/${folder}/${fileName}`;

  const { error } = await supabase.storage
    .from('menu-images')
    .upload(filePath, file, {
      cacheControl: '31536000',
      upsert: false,
    });

  if (error) {
    console.error('uploadMenuImage:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudo subir la imagen. Inténtalo de nuevo.'));
  }

  const { data } = supabase.storage.from('menu-images').getPublicUrl(filePath);
  return data.publicUrl;
}

export async function deleteMenuImage(publicUrl: string): Promise<{ ok: boolean }> {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  let filePath: string;
  try {
    // Extract path from public URL
    const url = new URL(publicUrl);
    const pathMatch = url.pathname.match(new RegExp('/menu-images/(.+)$'));
    if (!pathMatch) throw new AppError('La URL de la imagen no es válida.');
    filePath = pathMatch[1];
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('La URL de la imagen no es válida.');
  }

  // Verify the file belongs to this location
  if (!filePath.startsWith(`${staff.location_id}/`)) {
    throw new AppError('No tienes acceso a esta imagen.');
  }

  const { error } = await supabase.storage.from('menu-images').remove([filePath]);

  if (error) {
    console.error('deleteMenuImage:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudo eliminar la imagen anterior.'));
  }

  return { ok: true };
}
