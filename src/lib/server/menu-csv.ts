// src/lib/server/menu-csv.ts
'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getCurrentStaff } from '@/app/staff/page';
import { revalidatePath } from 'next/cache';
import { AppError } from '@/lib/errors';
import { generateCsv } from '@/lib/csv';
import {
  parseMenuCsvStructure,
  buildMenuValidationResult,
  MENU_CSV_COLUMNS,
  type MenuCsvValidationResult,
  type MenuImportMode,
  type MenuCsvValidationError,
} from '@/lib/menu-csv-parser';

export type { MenuImportMode, MenuCsvValidationError, MenuCsvValidationResult };

export interface MenuImportResult {
  ok: boolean;
  mode: MenuImportMode;
  createdCategories: number;
  createdProducts: number;
  skippedProducts: number;
  createdModifierGroups: number;
  createdModifierOptions: number;
}

/**
 * Valida un CSV antes de la importación y devuelve métricas de previsualización.
 */
export async function validateMenuCsv(csvContent: string): Promise<MenuCsvValidationResult> {
  return buildMenuValidationResult(csvContent);
}

/**
 * Resuelve IDs de alérgenos asegurando que existan en la tabla catálogo.
 */
async function resolveAllergenIds(supabase: any, names: string[]): Promise<string[]> {
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

/**
 * Resuelve IDs de etiquetas dietarias asegurando que existan en la tabla catálogo.
 */
async function resolveDietLabelIds(supabase: any, names: string[]): Promise<string[]> {
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

/**
 * Importa el menú completo desde un archivo CSV con modos 'replace' o 'append'.
 */
export async function importMenuFromCsv(payload: {
  csvContent: string;
  mode: MenuImportMode;
}): Promise<MenuImportResult> {
  const { staff } = await getCurrentStaff();
  const supabase = createServerClient();

  const { categories, errors } = parseMenuCsvStructure(payload.csvContent);

  if (errors.length > 0) {
    throw new AppError(`El archivo CSV contiene errores de formato: ${errors[0].message}`);
  }

  if (categories.size === 0) {
    throw new AppError('El archivo CSV no contiene categorías o productos válidos para importar.');
  }

  await supabase.rpc('set_config', {
    name: 'app.local_id',
    value: staff.location_id,
    is_local: true,
  });

  let createdCategories = 0;
  let createdProducts = 0;
  let skippedProducts = 0;
  let createdModifierGroups = 0;
  let createdModifierOptions = 0;

  if (payload.mode === 'replace') {
    // En modo reemplazo total, eliminamos las categorías actuales del local (cascada elimina productos y modificadores)
    const { error: delError } = await supabase
      .from('categories')
      .delete()
      .eq('location_id', staff.location_id);

    if (delError) {
      console.error('importMenuFromCsv replace delete error:', delError);
      throw new AppError('No se pudo limpiar el menú existente para el reemplazo.');
    }
  }

  // Obtener categorías existentes del local para modo append o mapeo
  const { data: existingCatsData } = await supabase
    .from('categories')
    .select('id, name')
    .eq('location_id', staff.location_id);

  const categoryMap = new Map<string, string>(); // name.toLowerCase() -> id
  for (const c of (existingCatsData ?? []) as any[]) {
    categoryMap.set(c.name.trim().toLowerCase(), c.id);
  }

  // Obtener productos existentes del local para evitar duplicados en modo append
  const { data: existingProdsData } = await supabase
    .from('products')
    .select('id, name, category_id')
    .eq('location_id', staff.location_id);

  const existingProductsSet = new Set<string>();
  for (const p of (existingProdsData ?? []) as any[]) {
    existingProductsSet.add(p.name.trim().toLowerCase());
  }

  // 1. Crear / Vincular Categorías
  for (const [catName, parsedCat] of categories.entries()) {
    const lowerName = catName.trim().toLowerCase();
    let catId = categoryMap.get(lowerName);

    if (!catId) {
      const { data: newCat, error: catError } = await supabase
        .from('categories')
        .insert({
          location_id: staff.location_id,
          name: parsedCat.name,
          description: parsedCat.description,
          sort_order: parsedCat.sort_order,
          is_active: true,
        })
        .select('id')
        .single();

      if (catError || !newCat?.id) {
        console.error('Error insert category:', catError);
        throw new AppError(`Error al crear la categoría "${parsedCat.name}".`);
      }
      const newId: string = newCat.id;
      catId = newId;
      categoryMap.set(lowerName, newId);
      createdCategories++;
    }

    if (!catId) {
      throw new AppError(`No se pudo resolver el identificador de la categoría "${parsedCat.name}".`);
    }

    const resolvedCategoryId: string = catId;

    // 2. Procesar Productos de la Categoría
    for (const [prodName, parsedProd] of parsedCat.products.entries()) {
      const prodLower = prodName.trim().toLowerCase();

      // En modo append: si el producto ya existe en este local, lo conservamos intacto sin modificar
      if (payload.mode === 'append' && existingProductsSet.has(prodLower)) {
        skippedProducts++;
        continue;
      }

      // Crear nuevo producto
      const { data: newProd, error: prodError } = await supabase
        .from('products')
        .insert({
          location_id: staff.location_id,
          category_id: resolvedCategoryId,
          name: parsedProd.name,
          description: parsedProd.description,
          base_price: parsedProd.base_price,
          is_available: parsedProd.is_available,
          image_url: parsedProd.image_url,
        })
        .select('id')
        .single();

      if (prodError || !newProd) {
        console.error('Error insert product:', prodError);
        throw new AppError(`Error al crear el producto "${parsedProd.name}".`);
      }

      const productId = newProd.id;
      createdProducts++;
      existingProductsSet.add(prodLower);

      // Sincronizar Alérgenos
      if (parsedProd.allergens.length > 0) {
        const allergenIds = await resolveAllergenIds(supabase, parsedProd.allergens);
        if (allergenIds.length > 0) {
          await supabase.from('product_allergens').insert(
            allergenIds.map((allergen_id) => ({
              product_id: productId,
              allergen_id,
            }))
          );
        }
      }

      // Sincronizar Etiquetas Dietarias
      if (parsedProd.diet_labels.length > 0) {
        const dietIds = await resolveDietLabelIds(supabase, parsedProd.diet_labels);
        if (dietIds.length > 0) {
          await supabase.from('product_diet_labels').insert(
            dietIds.map((diet_label_id) => ({
              product_id: productId,
              diet_label_id,
            }))
          );
        }
      }

      // 3. Procesar Grupos y Opciones de Modificadores para el Producto
      for (const [, parsedGroup] of parsedProd.modifier_groups.entries()) {
        const { data: newGroup, error: groupError } = await supabase
          .from('modifier_groups')
          .insert({
            location_id: staff.location_id,
            product_id: productId,
            name: parsedGroup.name,
            is_required: parsedGroup.is_required,
            min_selections: parsedGroup.min_selections,
            max_selections: parsedGroup.max_selections,
          })
          .select('id')
          .single();

        if (groupError || !newGroup) {
          console.error('Error insert modifier group:', groupError);
          continue;
        }

        createdModifierGroups++;

        const optionRows = Array.from(parsedGroup.options.values()).map((opt) => ({
          location_id: staff.location_id,
          modifier_group_id: newGroup.id,
          name: opt.name,
          price_impact: opt.price_impact,
          is_active: opt.is_active,
        }));

        if (optionRows.length > 0) {
          const { error: optError } = await supabase
            .from('modifier_options')
            .insert(optionRows);

          if (!optError) {
            createdModifierOptions += optionRows.length;
          }
        }
      }
    }
  }

  // Revalidar caches públicos y de administración
  const { data: local } = await supabase
    .from('locals')
    .select('slug')
    .eq('id', staff.location_id)
    .maybeSingle();

  if (local?.slug) {
    revalidatePath(`/${local.slug}`);
    revalidatePath(`/${local.slug}/checkout`);
  }
  revalidatePath('/staff/admin');
  revalidatePath('/staff/kds');
  revalidatePath('/staff/caja');

  return {
    ok: true,
    mode: payload.mode,
    createdCategories,
    createdProducts,
    skippedProducts,
    createdModifierGroups,
    createdModifierOptions,
  };
}

/**
 * Exporta el menú completo del local actual en formato CSV compatible con Excel.
 */
export async function exportMenuToCsv(): Promise<string> {
  const { staff } = await getCurrentStaff();
  const supabase = createServerClient();

  await supabase.rpc('set_config', {
    name: 'app.local_id',
    value: staff.location_id,
    is_local: true,
  });

  // Obtener categorías ordenadas
  const { data: categories, error: catError } = await supabase
    .from('categories')
    .select('*')
    .eq('location_id', staff.location_id)
    .order('sort_order', { ascending: true });

  if (catError) throw catError;

  // Obtener productos con grupos de modificadores y opciones
  const { data: productsData, error: prodError } = await supabase
    .from('products')
    .select(`
      *,
      category:categories(name, sort_order, description),
      modifier_groups(
        id, name, is_required, min_selections, max_selections,
        options:modifier_options(id, name, price_impact, is_active)
      )
    `)
    .eq('location_id', staff.location_id)
    .order('name', { ascending: true });

  if (prodError) throw prodError;

  const products = (productsData ?? []) as any[];
  const productIds = products.map((p) => p.id);

  // Cargar etiquetas puente
  let allergensByProduct = new Map<string, string[]>();
  let dietLabelsByProduct = new Map<string, string[]>();

  if (productIds.length > 0) {
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

    for (const row of (aRes.data ?? []) as any[]) {
      const name = row.allergens?.name;
      if (!name) continue;
      const list = allergensByProduct.get(row.product_id) ?? [];
      list.push(name);
      allergensByProduct.set(row.product_id, list);
    }

    for (const row of (dRes.data ?? []) as any[]) {
      const name = row.diet_labels?.name;
      if (!name) continue;
      const list = dietLabelsByProduct.get(row.product_id) ?? [];
      list.push(name);
      dietLabelsByProduct.set(row.product_id, list);
    }
  }

  // Generar filas planas para el CSV
  const exportRows: Record<string, any>[] = [];

  for (const prod of products) {
    const catName = prod.category?.name ?? 'General';
    const catSort = prod.category?.sort_order ?? 0;
    const catDesc = prod.category?.description ?? '';
    const allergensStr = (allergensByProduct.get(prod.id) ?? []).join(', ');
    const dietStr = (dietLabelsByProduct.get(prod.id) ?? []).join(', ');

    const groups = prod.modifier_groups ?? [];

    if (groups.length === 0) {
      // Producto sin modificadores -> 1 fila
      exportRows.push({
        categoria: catName,
        orden_categoria: catSort,
        descripcion_categoria: catDesc,
        producto: prod.name,
        descripcion: prod.description ?? '',
        precio: Number(prod.base_price).toFixed(2),
        disponible: prod.is_available ? 'SI' : 'NO',
        imagen_url: prod.image_url ?? '',
        alergenos: allergensStr,
        etiquetas_dietarias: dietStr,
        grupo_modificador: '',
        modificador_obligatorio: '',
        min_modificadores: '',
        max_modificadores: '',
        opcion_modificador: '',
        precio_opcion: '',
        opcion_activa: '',
      });
    } else {
      // Producto con modificadores: fila por cada opción
      let hasEmittedFirstOption = false;

      for (const group of groups) {
        const options = group.options ?? [];
        if (options.length === 0) {
          exportRows.push({
            categoria: catName,
            orden_categoria: catSort,
            descripcion_categoria: catDesc,
            producto: prod.name,
            descripcion: prod.description ?? '',
            precio: Number(prod.base_price).toFixed(2),
            disponible: prod.is_available ? 'SI' : 'NO',
            imagen_url: prod.image_url ?? '',
            alergenos: allergensStr,
            etiquetas_dietarias: dietStr,
            grupo_modificador: group.name,
            modificador_obligatorio: group.is_required ? 'SI' : 'NO',
            min_modificadores: group.min_selections,
            max_modificadores: group.max_selections,
            opcion_modificador: '',
            precio_opcion: '',
            opcion_activa: '',
          });
          hasEmittedFirstOption = true;
          continue;
        }

        for (const opt of options) {
          exportRows.push({
            categoria: catName,
            orden_categoria: catSort,
            descripcion_categoria: catDesc,
            producto: prod.name,
            descripcion: prod.description ?? '',
            precio: Number(prod.base_price).toFixed(2),
            disponible: prod.is_available ? 'SI' : 'NO',
            imagen_url: prod.image_url ?? '',
            alergenos: allergensStr,
            etiquetas_dietarias: dietStr,
            grupo_modificador: group.name,
            modificador_obligatorio: group.is_required ? 'SI' : 'NO',
            min_modificadores: group.min_selections,
            max_modificadores: group.max_selections,
            opcion_modificador: opt.name,
            precio_opcion: Number(opt.price_impact).toFixed(2),
            opcion_activa: opt.is_active ? 'SI' : 'NO',
          });
          hasEmittedFirstOption = true;
        }
      }

      if (!hasEmittedFirstOption) {
        exportRows.push({
          categoria: catName,
          orden_categoria: catSort,
          descripcion_categoria: catDesc,
          producto: prod.name,
          descripcion: prod.description ?? '',
          precio: Number(prod.base_price).toFixed(2),
          disponible: prod.is_available ? 'SI' : 'NO',
          imagen_url: prod.image_url ?? '',
          alergenos: allergensStr,
          etiquetas_dietarias: dietStr,
          grupo_modificador: '',
          modificador_obligatorio: '',
          min_modificadores: '',
          max_modificadores: '',
          opcion_modificador: '',
          precio_opcion: '',
          opcion_activa: '',
        });
      }
    }
  }

  return generateCsv(MENU_CSV_COLUMNS, exportRows, { includeBom: true, delimiter: ',' });
}

/**
 * Genera la plantilla de ejemplo de CSV con datos descriptivos.
 */
export async function getMenuCsvTemplate(): Promise<string> {
  const sampleRows: Record<string, any>[] = [
    {
      categoria: 'Hamburguesas',
      orden_categoria: 1,
      descripcion_categoria: 'Hamburguesas artesanales al carbón',
      producto: 'Hamburguesa Clásica',
      descripcion: 'Carne 150g, queso cheddar, lechuga y tomate en pan brioche',
      precio: '120.00',
      disponible: 'SI',
      imagen_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd',
      alergenos: 'GLUTEN, LACTEOS',
      etiquetas_dietarias: '',
      grupo_modificador: 'Término de la carne',
      modificador_obligatorio: 'SI',
      min_modificadores: 1,
      max_modificadores: 1,
      opcion_modificador: 'Término medio',
      precio_opcion: '0.00',
      opcion_activa: 'SI',
    },
    {
      categoria: 'Hamburguesas',
      orden_categoria: 1,
      descripcion_categoria: 'Hamburguesas artesanales al carbón',
      producto: 'Hamburguesa Clásica',
      descripcion: 'Carne 150g, queso cheddar, lechuga y tomate en pan brioche',
      precio: '120.00',
      disponible: 'SI',
      imagen_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd',
      alergenos: 'GLUTEN, LACTEOS',
      etiquetas_dietarias: '',
      grupo_modificador: 'Término de la carne',
      modificador_obligatorio: 'SI',
      min_modificadores: 1,
      max_modificadores: 1,
      opcion_modificador: 'Bien cocido',
      precio_opcion: '0.00',
      opcion_activa: 'SI',
    },
    {
      categoria: 'Hamburguesas',
      orden_categoria: 1,
      descripcion_categoria: 'Hamburguesas artesanales al carbón',
      producto: 'Hamburguesa Clásica',
      descripcion: 'Carne 150g, queso cheddar, lechuga y tomate en pan brioche',
      precio: '120.00',
      disponible: 'SI',
      imagen_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd',
      alergenos: 'GLUTEN, LACTEOS',
      etiquetas_dietarias: '',
      grupo_modificador: 'Extras',
      modificador_obligatorio: 'NO',
      min_modificadores: 0,
      max_modificadores: 3,
      opcion_modificador: 'Tocineta crujiente',
      precio_opcion: '25.00',
      opcion_activa: 'SI',
    },
    {
      categoria: 'Bebidas',
      orden_categoria: 2,
      descripcion_categoria: 'Bebidas frías y refrescos',
      producto: 'Refresco de cola 355ml',
      descripcion: 'Lata bien fría',
      precio: '35.00',
      disponible: 'SI',
      imagen_url: '',
      alergenos: '',
      etiquetas_dietarias: 'VEGANO',
      grupo_modificador: '',
      modificador_obligatorio: '',
      min_modificadores: '',
      max_modificadores: '',
      opcion_modificador: '',
      precio_opcion: '',
      opcion_activa: '',
    },
    {
      categoria: 'Postres',
      orden_categoria: 3,
      descripcion_categoria: 'Postres caseros',
      producto: 'Cheesecake de frutos rojos',
      descripcion: 'Porción individual con salsa artesanal de frambuesa',
      precio: '65.00',
      disponible: 'SI',
      imagen_url: '',
      alergenos: 'LACTEOS, GLUTEN',
      etiquetas_dietarias: 'VEGETARIANO',
      grupo_modificador: '',
      modificador_obligatorio: '',
      min_modificadores: '',
      max_modificadores: '',
      opcion_modificador: '',
      precio_opcion: '',
      opcion_activa: '',
    },
  ];

  return generateCsv(MENU_CSV_COLUMNS, sampleRows, { includeBom: true, delimiter: ',' });
}
