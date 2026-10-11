import { describe, it, expect } from 'vitest';
import { parseMenuCsvStructure } from '@/lib/menu-csv-parser';
import { getMenuCsvTemplate, validateMenuCsv } from '@/lib/server/menu-csv';

describe('Menu CSV Logic & Validation', () => {
  it('genera una plantilla válida y parseable con BOM UTF-8', async () => {
    const template = await getMenuCsvTemplate();
    expect(template.startsWith('\uFEFF')).toBe(true);
    expect(template).toContain('Categoría');
    expect(template).toContain('Hamburguesa Clásica');
    expect(template).toContain('Refresco de cola');

    const validation = await validateMenuCsv(template);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    expect(validation.summary.categoriesCount).toBe(3); // Hamburguesas, Bebidas, Postres
    expect(validation.summary.productsCount).toBe(3);
    expect(validation.summary.modifierGroupsCount).toBe(2); // Término y Extras
    expect(validation.summary.modifierOptionsCount).toBe(3); // Término medio, Bien cocido, Tocineta
  });

  it('agrupa múltiples filas de un mismo producto en grupos y opciones de modificadores', () => {
    const csv = `categoria,producto,precio,grupo_modificador,opcion_modificador,precio_opcion,modificador_obligatorio,min_modificadores,max_modificadores
Pizzas,Margarita,150,Tamaño,Personal,0,SI,1,1
Pizzas,Margarita,150,Tamaño,Familiar,60,SI,1,1
Pizzas,Margarita,150,Extra,Queso,20,NO,0,2`;

    const { categories, errors } = parseMenuCsvStructure(csv);
    expect(errors).toHaveLength(0);
    expect(categories.has('Pizzas')).toBe(true);

    const pizzasCat = categories.get('Pizzas')!;
    expect(pizzasCat.products.has('Margarita')).toBe(true);

    const prod = pizzasCat.products.get('Margarita')!;
    expect(prod.base_price).toBe(150);
    expect(prod.modifier_groups.size).toBe(2); // Tamaño y Extra

    const sizeGroup = prod.modifier_groups.get('Tamaño')!;
    expect(sizeGroup.is_required).toBe(true);
    expect(sizeGroup.min_selections).toBe(1);
    expect(sizeGroup.max_selections).toBe(1);
    expect(sizeGroup.options.size).toBe(2);
    expect(sizeGroup.options.get('Familiar')?.price_impact).toBe(60);

    const extraGroup = prod.modifier_groups.get('Extra')!;
    expect(extraGroup.is_required).toBe(false);
    expect(extraGroup.options.size).toBe(1);
    expect(extraGroup.options.get('Queso')?.price_impact).toBe(20);
  });

  it('detecta y reporta errores cuando faltan campos obligatorios o los tipos son inválidos', () => {
    const csv = `categoria,producto,precio
,Hamburguesa,100
Tacos,,50
Bebidas,Agua,-15
Bebidas,Cerveza,no-es-numero`;

    const { errors } = parseMenuCsvStructure(csv);
    expect(errors.length).toBeGreaterThanOrEqual(4);
    expect(errors.some((e) => e.message.includes('categoría es obligatoria'))).toBe(true);
    expect(errors.some((e) => e.message.includes('nombre del producto es obligatorio'))).toBe(true);
    expect(errors.some((e) => e.message.includes('mayor o igual a 0'))).toBe(true);
  });

  it('detecta error si max_modificadores es menor que min_modificadores', () => {
    const csv = `categoria,producto,precio,grupo_modificador,opcion_modificador,min_modificadores,max_modificadores
Postres,Helado,40,Toppings,Chispas,3,1`;

    const { errors } = parseMenuCsvStructure(csv);
    expect(errors.some((e) => e.message.includes('no puede ser menor que el mínimo'))).toBe(true);
  });

  it('parsea correctamente alérgenos y etiquetas dietarias delimitadas por coma o pleca', () => {
    const csv = `categoria,producto,precio,alergenos,etiquetas_dietarias
Platos Fuertes,Ensalada Cesar,95,"GLUTEN, LACTEOS","VEGETARIANO | SIN_LACTOSA"`;

    const { categories, errors } = parseMenuCsvStructure(csv);
    expect(errors).toHaveLength(0);

    const prod = categories.get('Platos Fuertes')!.products.get('Ensalada Cesar')!;
    expect(prod.allergens).toEqual(['GLUTEN', 'LACTEOS']);
    expect(prod.diet_labels).toEqual(['VEGETARIANO', 'SIN_LACTOSA']);
  });

  it('soporta encabezados en inglés y sin acentos', () => {
    const csv = `category,product,price,description,is_available
Drinks,Lemonade,30,Fresh lemonade,true`;

    const { categories, errors } = parseMenuCsvStructure(csv);
    expect(errors).toHaveLength(0);
    expect(categories.has('Drinks')).toBe(true);
    const prod = categories.get('Drinks')!.products.get('Lemonade')!;
    expect(prod.base_price).toBe(30);
    expect(prod.is_available).toBe(true);
  });
});
