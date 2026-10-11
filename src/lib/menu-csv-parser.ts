// src/lib/menu-csv-parser.ts
// Lógica pura de análisis y estructuración de datos de Menú CSV
// sin directiva 'use server' para permitir uso seguro en cliente, servidor y tests.

import { parseCsv, type CsvGenerateColumn } from '@/lib/csv';

export type MenuImportMode = 'replace' | 'append';

export interface MenuCsvValidationError {
  row: number;
  field?: string;
  message: string;
}

export interface ParsedModifierOption {
  name: string;
  price_impact: number;
  is_active: boolean;
}

export interface ParsedModifierGroup {
  name: string;
  is_required: boolean;
  min_selections: number;
  max_selections: number;
  options: Map<string, ParsedModifierOption>;
}

export interface ParsedProduct {
  name: string;
  description: string | null;
  base_price: number;
  is_available: boolean;
  image_url: string | null;
  allergens: string[];
  diet_labels: string[];
  modifier_groups: Map<string, ParsedModifierGroup>;
}

export interface ParsedCategory {
  name: string;
  sort_order: number;
  description: string | null;
  products: Map<string, ParsedProduct>;
}

export interface MenuCsvValidationResult {
  valid: boolean;
  errors: MenuCsvValidationError[];
  summary: {
    totalRows: number;
    categoriesCount: number;
    productsCount: number;
    modifierGroupsCount: number;
    modifierOptionsCount: number;
  };
  sampleItems: {
    category: string;
    product: string;
    price: number;
    available: boolean;
    modifiersCount: number;
  }[];
}

// Columnas canónicas para exportación y plantilla
export const MENU_CSV_COLUMNS: CsvGenerateColumn[] = [
  { key: 'categoria', label: 'Categoría' },
  { key: 'orden_categoria', label: 'Orden Categoría' },
  { key: 'descripcion_categoria', label: 'Descripción Categoría' },
  { key: 'producto', label: 'Producto' },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'precio', label: 'Precio' },
  { key: 'disponible', label: 'Disponible' },
  { key: 'imagen_url', label: 'Imagen URL' },
  { key: 'alergenos', label: 'Alérgenos' },
  { key: 'etiquetas_dietarias', label: 'Etiquetas Dietarias' },
  { key: 'grupo_modificador', label: 'Grupo Modificador' },
  { key: 'modificador_obligatorio', label: 'Modificador Obligatorio' },
  { key: 'min_modificadores', label: 'Mínimo Modificadores' },
  { key: 'max_modificadores', label: 'Máximo Modificadores' },
  { key: 'opcion_modificador', label: 'Opción Modificador' },
  { key: 'precio_opcion', label: 'Precio Extra Opción' },
  { key: 'opcion_activa', label: 'Opción Activa' },
];

/**
 * Normaliza un encabezado para mapear nombres alternativos en español e inglés.
 */
export function normalizeHeaderKey(key: string): string {
  const clean = key
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .trim()
    .replace(/[\s\-_]+/g, '');

  if (clean === 'categoria' || clean === 'category') return 'categoria';
  if (clean === 'ordencategoria' || clean === 'sortorder' || clean === 'orden') return 'orden_categoria';
  if (clean === 'descripcioncategoria' || clean === 'categorydescription') return 'descripcion_categoria';
  if (clean === 'producto' || clean === 'platillo' || clean === 'product' || clean === 'nombre' || clean === 'name') return 'producto';
  if (clean === 'descripcion' || clean === 'description') return 'descripcion';
  if (clean === 'precio' || clean === 'preciobase' || clean === 'price' || clean === 'baseprice') return 'precio';
  if (clean === 'disponible' || clean === 'activo' || clean === 'isavailable' || clean === 'available') return 'disponible';
  if (clean === 'imagenurl' || clean === 'imagen' || clean === 'imageurl' || clean === 'image') return 'imagen_url';
  if (clean === 'alergenos' || clean === 'allergens') return 'alergenos';
  if (clean === 'etiquetasdietarias' || clean === 'dietlabels' || clean === 'dietas' || clean === 'etiquetas') return 'etiquetas_dietarias';
  if (clean === 'grupomodificador' || clean === 'modifiergroup' || clean === 'grupomod' || clean === 'modificador') return 'grupo_modificador';
  if (clean === 'modificadorobligatorio' || clean === 'modifierrequired' || clean === 'obligatorio' || clean === 'isrequired') return 'modificador_obligatorio';
  if (clean === 'minmodificadores' || clean === 'minimodificadores' || clean === 'minimomodificadores' || clean === 'minselections' || clean === 'min') return 'min_modificadores';
  if (clean === 'maxmodificadores' || clean === 'maximomodificadores' || clean === 'maxselections' || clean === 'max') return 'max_modificadores';
  if (clean === 'opcionmodificador' || clean === 'modifieroption' || clean === 'opcion') return 'opcion_modificador';
  if (clean === 'precioopcion' || clean === 'precioextraopcion' || clean === 'precioextra' || clean === 'priceimpact' || clean === 'optionprice') return 'precio_opcion';
  if (clean === 'opcionactiva' || clean === 'optionactive' || clean === 'activa') return 'opcion_activa';

  return clean;
}

/**
 * Helper para interpretar booleanos en español/inglés.
 */
export function parseBoolean(val: unknown, defaultValue = true): boolean {
  if (val === null || val === undefined || val === '') return defaultValue;
  const s = String(val).trim().toLowerCase();
  if (['si', 'sí', 'true', '1', 's', 't', 'yes', 'y'].includes(s)) return true;
  if (['no', 'false', '0', 'n', 'f'].includes(s)) return false;
  return defaultValue;
}

/**
 * Helper para parsear números decimales soportando coma o punto.
 */
export function parseNumber(val: unknown, defaultValue = 0): number {
  if (val === null || val === undefined || val === '') return defaultValue;
  const clean = String(val).trim().replace(',', '.');
  const num = Number(clean);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Procesa el CSV en una estructura en memoria validando consistencia.
 */
export function parseMenuCsvStructure(csvContent: string): {
  categories: Map<string, ParsedCategory>;
  errors: MenuCsvValidationError[];
  totalRows: number;
} {
  const { headers, rows } = parseCsv(csvContent);
  const errors: MenuCsvValidationError[] = [];
  const categories = new Map<string, ParsedCategory>();

  if (rows.length === 0) {
    errors.push({ row: 0, message: 'El archivo CSV está vacío o no contiene filas de datos.' });
    return { categories, errors, totalRows: 0 };
  }

  // Mapear encabezados encontrados a claves normalizadas
  const headerMap = new Map<string, string>();
  for (const h of headers) {
    headerMap.set(h, normalizeHeaderKey(h));
  }

  let rowNumber = 1; // 1-indexed (fila 1 = primera fila de datos, fila 0 = header)
  for (const rawRow of rows) {
    rowNumber++;
    // Normalizar fila
    const row: Record<string, string> = {};
    for (const [rawKey, val] of Object.entries(rawRow)) {
      const normKey = headerMap.get(rawKey) ?? normalizeHeaderKey(rawKey);
      row[normKey] = val?.trim() ?? '';
    }

    const categoryName = row['categoria'];
    const productName = row['producto'];

    if (!categoryName) {
      errors.push({ row: rowNumber, field: 'Categoría', message: 'La categoría es obligatoria.' });
      continue;
    }

    if (!productName) {
      errors.push({ row: rowNumber, field: 'Producto', message: 'El nombre del producto es obligatorio.' });
      continue;
    }

    const priceRaw = row['precio'];
    if (!priceRaw && priceRaw !== '0') {
      errors.push({ row: rowNumber, field: 'Precio', message: 'El precio del producto es obligatorio.' });
      continue;
    }

    const price = parseNumber(priceRaw, -1);
    if (price < 0) {
      errors.push({ row: rowNumber, field: 'Precio', message: `El precio "${priceRaw}" debe ser un número mayor o igual a 0.` });
      continue;
    }

    // Obtener o crear Categoría
    let category = categories.get(categoryName);
    if (!category) {
      const sortOrder = row['orden_categoria'] ? parseInt(row['orden_categoria'], 10) || 0 : 0;
      category = {
        name: categoryName,
        sort_order: sortOrder,
        description: row['descripcion_categoria'] || null,
        products: new Map(),
      };
      categories.set(categoryName, category);
    }

    // Obtener o crear Producto
    let product = category.products.get(productName);
    if (!product) {
      const allergens = row['alergenos']
        ? row['alergenos'].split(/[,|;]/).map((a) => a.trim().toUpperCase()).filter(Boolean)
        : [];
      const dietLabels = row['etiquetas_dietarias']
        ? row['etiquetas_dietarias'].split(/[,|;]/).map((d) => d.trim().toUpperCase()).filter(Boolean)
        : [];

      product = {
        name: productName,
        description: row['descripcion'] || null,
        base_price: price,
        is_available: parseBoolean(row['disponible'], true),
        image_url: row['imagen_url'] || null,
        allergens,
        diet_labels: dietLabels,
        modifier_groups: new Map(),
      };
      category.products.set(productName, product);
    }

    // Modificadores opcionales en la fila
    const modGroupName = row['grupo_modificador'];
    const modOptionName = row['opcion_modificador'];

    if (modGroupName && modOptionName) {
      let group = product.modifier_groups.get(modGroupName);
      if (!group) {
        const isRequired = parseBoolean(row['modificador_obligatorio'], false);
        const minSel = row['min_modificadores'] ? parseInt(row['min_modificadores'], 10) || 0 : (isRequired ? 1 : 0);
        const maxSel = row['max_modificadores'] ? parseInt(row['max_modificadores'], 10) || 0 : (isRequired ? 1 : 0);

        if (maxSel > 0 && maxSel < minSel) {
          errors.push({
            row: rowNumber,
            field: 'Máximo Modificadores',
            message: `El máximo de selecciones (${maxSel}) no puede ser menor que el mínimo (${minSel}) para el grupo "${modGroupName}".`,
          });
        }

        group = {
          name: modGroupName,
          is_required: isRequired,
          min_selections: minSel,
          max_selections: maxSel,
          options: new Map(),
        };
        product.modifier_groups.set(modGroupName, group);
      }

      const optionPrice = parseNumber(row['precio_opcion'], 0);
      const optionActive = parseBoolean(row['opcion_activa'], true);

      if (!group.options.has(modOptionName)) {
        group.options.set(modOptionName, {
          name: modOptionName,
          price_impact: optionPrice,
          is_active: optionActive,
        });
      }
    }
  }

  return { categories, errors, totalRows: rows.length };
}

/**
 * Valida un CSV y genera métricas de previsualización sin escribir en base de datos.
 */
export function buildMenuValidationResult(csvContent: string): MenuCsvValidationResult {
  const { categories, errors, totalRows } = parseMenuCsvStructure(csvContent);

  let productsCount = 0;
  let modifierGroupsCount = 0;
  let modifierOptionsCount = 0;
  const sampleItems: MenuCsvValidationResult['sampleItems'] = [];

  for (const [catName, cat] of categories.entries()) {
    for (const [prodName, prod] of cat.products.entries()) {
      productsCount++;
      const groups = Array.from(prod.modifier_groups.values());
      modifierGroupsCount += groups.length;
      let totalProdOpts = 0;
      for (const g of groups) {
        modifierOptionsCount += g.options.size;
        totalProdOpts += g.options.size;
      }

      if (sampleItems.length < 8) {
        sampleItems.push({
          category: catName,
          product: prodName,
          price: prod.base_price,
          available: prod.is_available,
          modifiersCount: totalProdOpts,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    summary: {
      totalRows,
      categoriesCount: categories.size,
      productsCount,
      modifierGroupsCount,
      modifierOptionsCount,
    },
    sampleItems,
  };
}
