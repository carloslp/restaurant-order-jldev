import { describe, it, expect } from 'vitest';
import type { Product, ModifierGroup, ModifierOption } from '@/lib/types';
import {
  validateGroupSelections,
  getFirstPendingRequiredGroup,
  calculateProductTotalPrice,
  toggleGroupOption,
  getModifierGroupBadge,
  getActionButtonState,
} from '@/lib/modifiers';

function makeOption(id: string, name: string, price_impact = 0): ModifierOption {
  return {
    id,
    location_id: 'loc-1',
    modifier_group_id: 'grp-1',
    name,
    price_impact,
    is_active: true,
  };
}

function makeGroup(overrides: Partial<ModifierGroup> = {}): ModifierGroup {
  return {
    id: 'grp-term',
    location_id: 'loc-1',
    product_id: 'prod-1',
    name: 'Término de la carne',
    is_required: true,
    min_selections: 1,
    max_selections: 1,
    options: [
      makeOption('opt-1', 'Término medio', 0),
      makeOption('opt-2', 'Tres cuartos', 0),
      makeOption('opt-3', 'Bien cocido', 0),
    ],
    ...overrides,
  };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    location_id: 'loc-1',
    category_id: 'cat-1',
    name: 'Corte Rib Eye',
    description: '350g de corte suave y jugoso',
    image_url: null,
    base_price: 120,
    is_available: true,
    modifier_groups: [],
    ...overrides,
  };
}

describe('FEATURE F-01: Experiencia de Selección de Modificadores en Móvil', () => {
  describe('CA-1 – Validación de grupo obligatorio (Camino feliz)', () => {
    it('cuando un grupo es obligatorio y no tiene selección, el botón permanece deshabilitado con "Selecciona [Nombre del Grupo]"', () => {
      const requiredGroup = makeGroup({ name: 'Término de la carne', is_required: true, min_selections: 1 });
      const product = makeProduct({ modifier_groups: [requiredGroup] });
      const selections: Record<string, Set<string>> = {
        [requiredGroup.id]: new Set(),
      };

      const pending = getFirstPendingRequiredGroup(product.modifier_groups!, selections);
      expect(pending).not.toBeNull();
      expect(pending?.name).toBe('Término de la carne');

      const buttonState = getActionButtonState(product.modifier_groups!, selections, product.base_price);
      expect(buttonState.isValid).toBe(false);
      expect(buttonState.buttonText).toBe('Selecciona Término de la carne');
    });

    it('al seleccionar una opción válida en el grupo obligatorio, el botón se habilita para agregar al carrito', () => {
      const requiredGroup = makeGroup({ name: 'Término de la carne', is_required: true, min_selections: 1 });
      const product = makeProduct({ modifier_groups: [requiredGroup] });
      const selections: Record<string, Set<string>> = {
        [requiredGroup.id]: new Set(['opt-1']),
      };

      const pending = getFirstPendingRequiredGroup(product.modifier_groups!, selections);
      expect(pending).toBeNull();

      const buttonState = getActionButtonState(product.modifier_groups!, selections, product.base_price);
      expect(buttonState.isValid).toBe(true);
      expect(buttonState.buttonText).toContain('Agregar al carrito');
      expect(buttonState.buttonText).toContain('$120.00');
    });

    it('si hay múltiples grupos requeridos pendientes, indica el primer grupo incompleto en orden', () => {
      const group1 = makeGroup({ id: 'g1', name: 'Término de la carne', is_required: true });
      const group2 = makeGroup({ id: 'g2', name: 'Guarnición', is_required: true });
      const product = makeProduct({ modifier_groups: [group1, group2] });

      // Ninguno seleccionado
      let state = getActionButtonState(product.modifier_groups!, {}, product.base_price);
      expect(state.buttonText).toBe('Selecciona Término de la carne');

      // Selecciona group1, group2 sigue pendiente
      state = getActionButtonState(
        product.modifier_groups!,
        { g1: new Set(['opt-1']) },
        product.base_price
      );
      expect(state.buttonText).toBe('Selecciona Guarnición');

      // Selecciona ambos
      state = getActionButtonState(
        product.modifier_groups!,
        { g1: new Set(['opt-1']), g2: new Set(['opt-2']) },
        product.base_price
      );
      expect(state.isValid).toBe(true);
      expect(state.buttonText).toContain('Agregar al carrito');
    });
  });

  describe('CA-2 – Actualización dinámica de precio incremental', () => {
    it('dado un producto base de $120.00 con un extra opcional de $25.00, al seleccionarlo el total visible cambia a $145.00', () => {
      const optionalExtraGroup = makeGroup({
        id: 'extras',
        name: 'Extras',
        is_required: false,
        min_selections: 0,
        max_selections: 3,
        options: [makeOption('opt-extra-1', 'Queso fundido extra', 25)],
      });

      const product = makeProduct({
        base_price: 120,
        modifier_groups: [optionalExtraGroup],
      });

      // Inicialmente sin extra
      const selections: Record<string, Set<string>> = {
        extras: new Set(),
      };
      let total = calculateProductTotalPrice(product, selections);
      expect(total).toBe(120);

      let buttonState = getActionButtonState(product.modifier_groups!, selections, total);
      expect(buttonState.buttonText).toContain('$120.00');

      // Usuario activa la casilla del extra
      selections.extras = new Set(['opt-extra-1']);
      total = calculateProductTotalPrice(product, selections);
      expect(total).toBe(145);

      buttonState = getActionButtonState(product.modifier_groups!, selections, total);
      expect(buttonState.isValid).toBe(true);
      expect(buttonState.buttonText).toBe('Agregar al carrito · $145.00');
    });

    it('actualiza el total multiplicando por cantidad si es mayor a 1', () => {
      const group = makeGroup({
        id: 'extras',
        is_required: false,
        options: [makeOption('opt-1', 'Tocino', 20)],
      });
      const product = makeProduct({ base_price: 100, modifier_groups: [group] });
      const selections = { extras: new Set(['opt-1']) };

      expect(calculateProductTotalPrice(product, selections, 2)).toBe(240);
    });
  });

  describe('CA-3 – Límite máximo de selección', () => {
    it('dado un grupo con max_selections = 2, al intentar marcar una tercera opción se bloquea y muestra microcopy inline', () => {
      const group = makeGroup({
        id: 'grp-toppings',
        name: 'Toppings',
        is_required: false,
        min_selections: 0,
        max_selections: 2,
        options: [
          makeOption('t1', 'Aguacate'),
          makeOption('t2', 'Cebolla caramelizada'),
          makeOption('t3', 'Champiñones'),
        ],
      });

      // Paso 1: Selecciona primera opción
      let current = new Set<string>();
      let res = toggleGroupOption(group, current, 't1');
      expect(res.blocked).toBe(false);
      expect(res.limitWarning).toBeUndefined();
      current = res.nextSelections;
      expect(Array.from(current)).toEqual(['t1']);

      // Paso 2: Selecciona segunda opción (alcanza el tope de 2)
      res = toggleGroupOption(group, current, 't2');
      expect(res.blocked).toBe(false);
      expect(res.limitWarning).toBeUndefined();
      current = res.nextSelections;
      expect(current.size).toBe(2);

      // Paso 3: Intenta tocar una tercera opción (t3)
      res = toggleGroupOption(group, current, 't3');
      expect(res.blocked).toBe(true);
      expect(res.limitWarning).toBe('Máximo 2 opciones permitidas');
      // La tercera opción NO se agrega
      expect(res.nextSelections.has('t3')).toBe(false);
      expect(res.nextSelections.size).toBe(2);

      // Paso 4: Deselecciona una de las opciones previas (t1) -> se limpia el microcopy
      res = toggleGroupOption(group, current, 't1');
      expect(res.blocked).toBe(false);
      expect(res.limitWarning).toBeUndefined();
      current = res.nextSelections;
      expect(current.size).toBe(1);
      expect(current.has('t1')).toBe(false);
      expect(current.has('t2')).toBe(true);
    });

    it('en grupos de selección única (max_selections = 1), alternar una opción sustituye la anterior sin error de tope', () => {
      const group = makeGroup({ max_selections: 1 });
      let current = new Set<string>(['opt-1']);

      const res = toggleGroupOption(group, current, 'opt-2');
      expect(res.blocked).toBe(false);
      expect(res.limitWarning).toBeUndefined();
      expect(Array.from(res.nextSelections)).toEqual(['opt-2']);
    });
  });

  describe('Alcance y Badges de Selección ("Obligatorio: elige 1" vs "Opcional")', () => {
    it('muestra "Obligatorio: elige 1" para grupos requeridos de selección única', () => {
      const group = makeGroup({ is_required: true, min_selections: 1, max_selections: 1 });
      const badge = getModifierGroupBadge(group);
      expect(badge.isRequired).toBe(true);
      expect(badge.label).toBe('Obligatorio: elige 1');
    });

    it('muestra "Opcional" para grupos no obligatorios', () => {
      const group = makeGroup({ is_required: false, min_selections: 0, max_selections: 2 });
      const badge = getModifierGroupBadge(group);
      expect(badge.isRequired).toBe(false);
      expect(badge.label).toBe('Opcional');
    });

    it('valida grupo con min_selections > 1 correctamente', () => {
      const group = makeGroup({ is_required: true, min_selections: 2, max_selections: 3 });
      const badge = getModifierGroupBadge(group);
      expect(badge.label).toBe('Obligatorio: elige al menos 2');

      const validationIncomplete = validateGroupSelections(group, new Set(['opt-1']));
      expect(validationIncomplete.isValid).toBe(false);
      expect(validationIncomplete.isMissing).toBe(true);

      const validationComplete = validateGroupSelections(group, new Set(['opt-1', 'opt-2']));
      expect(validationComplete.isValid).toBe(true);
      expect(validationComplete.isMissing).toBe(false);
    });
  });
});
