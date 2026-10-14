import { describe, it, expect } from 'vitest';
import type { Product, ModifierGroup } from '@/lib/types';
import { calculateProductTotalPrice, getActionButtonState } from '@/lib/modifiers';

describe('Feature 1 - Menú Digital, Personalización Guiada y Filtros de Alérgenos', () => {
  const sampleProducts: Product[] = [
    {
      id: 'p-1',
      location_id: 'loc-1',
      category_id: 'cat-1',
      name: 'Hamburguesa Clásica',
      description: 'Carne de res con pan brioche y queso',
      base_price: 150,
      is_available: true,
      image_url: null,
      allergens: ['Gluten', 'Lácteos'],
      diet_labels: [],
      modifier_groups: [
        {
          id: 'mg-1',
          location_id: 'loc-1',
          product_id: 'p-1',
          name: 'Término de la carne',
          is_required: true,
          min_selections: 1,
          max_selections: 1,
          options: [
            { id: 'opt-1', location_id: 'loc-1', modifier_group_id: 'mg-1', name: 'Término medio', price_impact: 0, is_active: true },
            { id: 'opt-2', location_id: 'loc-1', modifier_group_id: 'mg-1', name: 'Bien cocido', price_impact: 0, is_active: true },
          ],
        },
        {
          id: 'mg-2',
          location_id: 'loc-1',
          product_id: 'p-1',
          name: 'Extras',
          is_required: false,
          min_selections: 0,
          max_selections: 2,
          options: [
            { id: 'opt-3', location_id: 'loc-1', modifier_group_id: 'mg-2', name: 'Tocino crujiente', price_impact: 25, is_active: true },
            { id: 'opt-4', location_id: 'loc-1', modifier_group_id: 'mg-2', name: 'Queso extra', price_impact: 20, is_active: true },
          ],
        },
      ],
    },
    {
      id: 'p-2',
      location_id: 'loc-1',
      category_id: 'cat-1',
      name: 'Ensalada César',
      description: 'Lechuga romana con aderezo césar',
      base_price: 110,
      is_available: true,
      image_url: null,
      allergens: ['Lácteos'],
      diet_labels: ['Vegetariano'],
      modifier_groups: [],
    },
    {
      id: 'p-3',
      location_id: 'loc-1',
      category_id: 'cat-2',
      name: 'Bowl Vegano Sin Gluten',
      description: 'Quinoa, aguacate y vegetales frescos',
      base_price: 135,
      is_available: true,
      image_url: null,
      allergens: [],
      diet_labels: ['Vegano', 'Sin Gluten'],
      modifier_groups: [],
    },
  ];

  describe('CA-1.1: Filtrado excluyente de alérgenos', () => {
    it('filtra y excluye instantáneamente platillos que contengan el alérgeno seleccionado', () => {
      const excludedAllergens = ['Gluten'];
      const filtered = sampleProducts.filter((p) => {
        const prodAllergens = (p.allergens || []).map((a) => a.toLowerCase().trim());
        return !excludedAllergens.some((ex) => prodAllergens.includes(ex.toLowerCase().trim()));
      });

      expect(filtered).toHaveLength(2);
      expect(filtered.map((p) => p.name)).toEqual(['Ensalada César', 'Bowl Vegano Sin Gluten']);
      expect(filtered.some((p) => p.name.includes('Hamburguesa'))).toBe(false);
    });

    it('permite exclusiones múltiples acumulativas', () => {
      const excludedAllergens = ['Gluten', 'Lácteos'];
      const filtered = sampleProducts.filter((p) => {
        const prodAllergens = (p.allergens || []).map((a) => a.toLowerCase().trim());
        return !excludedAllergens.some((ex) => prodAllergens.includes(ex.toLowerCase().trim()));
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('Bowl Vegano Sin Gluten');
    });
  });

  describe('CA-1.2: Detección y guía automática a modificador obligatorio faltante', () => {
    it('detecta cuando un grupo obligatorio (min: 1) no tiene selección', () => {
      const product = sampleProducts[0];
      const selections: Record<string, Set<string>> = {}; // sin selección

      const state = getActionButtonState(product.modifier_groups!, selections, 150, 'generic');
      expect(state.isValid).toBe(false);
      expect(state.buttonText).toContain('Elige opciones obligatorias');

      // Buscar el primer grupo obligatorio no cumplido
      const firstInvalidGroup = product.modifier_groups!.find((g) => {
        const selCount = (selections[g.id] || new Set()).size;
        const min = g.min_selections > 0 ? g.min_selections : (g.is_required ? 1 : 0);
        return selCount < min;
      });

      expect(firstInvalidGroup).toBeDefined();
      expect(firstInvalidGroup?.id).toBe('mg-1');
      expect(firstInvalidGroup?.name).toBe('Término de la carne');
    });

    it('marca estado válido cuando se selecciona la opción obligatoria', () => {
      const product = sampleProducts[0];
      const selections: Record<string, Set<string>> = {
        'mg-1': new Set(['opt-1']),
      };

      const state = getActionButtonState(product.modifier_groups!, selections, 150, 'generic');
      expect(state.isValid).toBe(true);
      expect(state.buttonText).toContain('Agregar');
    });
  });

  describe('CA-1.3: Actualización de precio en tiempo real en el CTA', () => {
    it('calcula el precio base + modificadores seleccionados en < 50ms', () => {
      const product = sampleProducts[0];
      const selections: Record<string, Set<string>> = {
        'mg-1': new Set(['opt-1']), // 0
        'mg-2': new Set(['opt-3']), // +25
      };

      const start = performance.now();
      const total = calculateProductTotalPrice(product, selections, 1);
      const elapsed = performance.now() - start;

      expect(total).toBe(175); // 150 base + 25 extra
      expect(elapsed).toBeLessThan(50);
    });

    it('multiplica correctamente por la cantidad seleccionada', () => {
      const product = sampleProducts[0];
      const selections: Record<string, Set<string>> = {
        'mg-1': new Set(['opt-1']),
        'mg-2': new Set(['opt-3']), // +25
      };

      const totalQty2 = calculateProductTotalPrice(product, selections, 2);
      expect(totalQty2).toBe(350); // (150 + 25) * 2
    });
  });

  describe('CA-1.5: Estado vacío cuando no hay resultados tras filtrar', () => {
    it('identifica correctamente cuando la combinación de filtros devuelve 0 productos', () => {
      const excludedAllergens = ['Gluten', 'Lácteos'];
      const search = 'Hamburguesa';

      const filtered = sampleProducts.filter((p) => {
        const term = search.toLowerCase();
        const matchesSearch = p.name.toLowerCase().includes(term);
        if (!matchesSearch) return false;

        const prodAllergens = (p.allergens || []).map((a) => a.toLowerCase());
        const hasExcluded = excludedAllergens.some((ex) => prodAllergens.includes(ex.toLowerCase()));
        return !hasExcluded;
      });

      expect(filtered).toHaveLength(0);
    });
  });
});
