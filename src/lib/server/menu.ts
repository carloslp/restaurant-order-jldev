// src/lib/server/menu.ts
'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getCurrentStaff } from '@/app/staff/page';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import type { Category, Product } from '@/lib/types';

// --- Schemas ---
const CategorySchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  description: z.string().nullish(),
  image_url: z.string().url().nullish(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().min(0).default(0),
});

const ProductSchema = z.object({
  category_id: z.string().uuid('Categoría inválida'),
  name: z.string().min(1, 'El nombre es requerido'),
  description: z.string().nullish(),
  image_url: z.string().url().nullish(),
  base_price: z.number().positive('El precio debe ser mayor a 0'),
  is_available: z.boolean().default(true),
  allergens: z.array(z.string()).optional(),
  diet_labels: z.array(z.string()).optional(),
});

// --- Helpers ---
async function getAdminContext() {
  const { staff } = await getCurrentStaff();
  if (staff.role !== 'ADMIN') {
    throw new Error('No autorizado: Se requieren permisos de administrador');
  }
  return staff;
}

// --- Categories ---

export async function listCategories(): Promise<Category[]> {
  const staff = await getAdminContext();
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
  const staff = await getAdminContext();
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
  const staff = await getAdminContext();
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
  const staff = await getAdminContext();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id)
    .eq('location_id', staff.location_id);

  if (error) throw error;

  revalidatePath('/staff/admin');
  return { ok: true };
}

// --- Products ---

export async function listProducts(categoryId?: string): Promise<Product[]> {
  const staff = await getAdminContext();
  const supabase = createServerClient();

  await supabase.rpc('set_config', {
    name: 'app.local_id',
    value: staff.location_id,
    is_local: true,
  });

  let query = supabase
    .from('products')
    .select('*, modifier_groups(id, name, is_required, min_selections, max_selections, options(id, name, price_impact, is_active))')
    .order('name', { ascending: true });

  if (categoryId) {
    query = query.eq('category_id', categoryId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data ?? []) as any as Product[];
}

export async function createProduct(payload: z.infer<typeof ProductSchema>) {
  const staff = await getAdminContext();
  const validated = ProductSchema.parse(payload);
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('products')
    .insert({
      ...validated,
      location_id: staff.location_id,
    })
    .select()
    .single();

  if (error) throw error;

  revalidatePath('/staff/admin');
  return data as Product;
}

export async function updateProduct(id: string, payload: z.infer<typeof ProductSchema>) {
  const staff = await getAdminContext();
  const validated = ProductSchema.parse(payload);
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('products')
    .update(validated)
    .eq('id', id)
    .eq('location_id', staff.location_id)
    .select()
    .single();

  if (error) throw error;

  revalidatePath('/staff/admin');
  return data as Product;
}

export async function deleteProduct(id: string) {
  const staff = await getAdminContext();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id)
    .eq('location_id', staff.location_id);

  if (error) throw error;

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
  const staff = await getAdminContext();
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
    .select('*, options(*)')
    .eq('product_id', productId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

export async function createModifierGroup(payload: z.infer<typeof ModifierGroupSchema>) {
  const staff = await getAdminContext();
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
    .insert(validated)
    .select('*, options(*)')
    .single();

  if (error) throw error;

  revalidatePath('/staff/admin');
  return data;
}

export async function updateModifierGroup(id: string, payload: z.infer<typeof ModifierGroupSchema>) {
  const staff = await getAdminContext();
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
    .select('*, options(*)')
    .single();

  if (error) throw error;

  revalidatePath('/staff/admin');
  return data;
}

export async function deleteModifierGroup(id: string) {
  const staff = await getAdminContext();
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
  const staff = await getAdminContext();
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
    .insert(validated)
    .select()
    .single();

  if (error) throw error;

  revalidatePath('/staff/admin');
  return data;
}

export async function updateModifierOption(id: string, payload: z.infer<typeof ModifierOptionSchema>) {
  const staff = await getAdminContext();
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
  const staff = await getAdminContext();
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
  const staff = await getAdminContext();
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
  const staff = await getAdminContext();
  const supabase = createServerClient();

  // Extract path from public URL
  const url = new URL(publicUrl);
  const pathMatch = url.pathname.match(/\\/menu-images\\/(.+)$/);
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
