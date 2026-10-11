import { describe, it, expect } from 'vitest';
import type { Product, ModifierGroup, ModifierOption } from '@/lib/types';
import {
  validateGroupSelections,
  getFirstPendingRequiredGroup,
  calculateProductTotalPrice,
  toggleGroupOption,
  getModifierGroupBadge,
  getActionButtonState,
  formatPendingGroupPrompt,
  ACCESSIBLE_TOUCH_TARGET,
  ACCESSIBLE_FOCUS_RING,
} from '@/lib/modifiers';
import fs from 'node:fs';
import path from 'node:path';

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
    id: 'grp-salsa',
    location_id: 'loc-1',
    product_id: 'prod-1',
    name: 'Tipo de Salsa',
    is_required: true,
    min_selections: 1,
    max_selections: 1,
    options: [
      makeOption('opt-1', 'Salsa Verde', 0),
      makeOption('opt-2', 'Salsa Roja', 0),
      makeOption('opt-3', 'Salsa Habanero', 10),
    ],
    ...overrides,
  };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    location_id: 'loc-1',
    category_id: 'cat-1',
    name: 'Chilaquiles Especiales',
    description: 'Totopos bañados en salsa con crema, queso y proteína a elegir',
    image_url: null,
    base_price: 120,
    is_available: true,
    modifier_groups: [],
    ...overrides,
  };
}

describe('FEATURE F-01: Experiencia de Configuración de Platillos sin Errores', () => {
  describe('ENABLER E-01 [Design System / UI]: Componentes de Selección Táctil Accesible', () => {
    it('tokens de target táctil actualizados a mínimo 44×44 px y exportados para el Design System', () => {
      expect(ACCESSIBLE_TOUCH_TARGET).toContain('min-w-[44px]');
      expect(ACCESSIBLE_TOUCH_TARGET).toContain('min-h-[44px]');
    });

    it('estados :focus-visible definen anillo con contraste ≥ 3:1 (ring-2 ring-emerald-500 ring-offset-2)', () => {
      expect(ACCESSIBLE_FOCUS_RING).toContain('ring-2');
      expect(ACCESSIBLE_FOCUS_RING).toContain('ring-emerald-500');
      expect(ACCESSIBLE_FOCUS_RING).toContain('ring-offset-2');
    });

    it('ModifierSelector implementa target táctil mínimo de 44×44 px y focus-visible ring-emerald-500 en botones de incremento, checkbox y radios', () => {
      const filePath = path.resolve(__dirname, '../src/app/[location]/ModifierSelector.tsx');
      const source = fs.readFileSync(filePath, 'utf8');

      // Botones de incremento y decremento
      expect(source).toContain('aria-label="Disminuir cantidad"');
      expect(source).toContain('aria-label="Aumentar cantidad"');
      expect(source).toContain('min-w-[48px] min-h-[48px]');

      // Checkbox y radios
      expect(source).toContain('role={isSingle ? \'radio\' : \'checkbox\'}');
      expect(source).toContain('min-h-[48px] min-w-[44px]');

      // Focus visible con contraste ≥ 3:1
      expect(source).toContain('focus-visible:ring-emerald-500');
      expect(source).toContain('focus-visible:ring-offset-2');
    });

    it('MenuClient y AddToCartButton aplican tokens táctiles accesibles ≥ 44×44 px y focus-visible ring-emerald-500', () => {
      const menuClientPath = path.resolve(__dirname, '../src/app/[location]/MenuClient.tsx');
      const menuClientSource = fs.readFileSync(menuClientPath, 'utf8');

      expect(menuClientSource).toContain('min-w-[44px] min-h-[44px]');
      expect(menuClientSource).toContain('focus-visible:ring-emerald-500');

      const addToCartPath = path.resolve(__dirname, '../src/app/[location]/AddToCartButton.tsx');
      const addToCartSource = fs.readFileSync(addToCartPath, 'utf8');

      expect(addToCartSource).toContain('min-w-[44px]');
      expect(addToCartSource).toContain('focus-visible:ring-emerald-500');
    });
  });

  describe('US-01: Selección guiada de modificadores obligatorios', () => {
    describe('Escenario: Grupo obligatorio incompleto', () => {
      it('dado que abro un producto con el grupo "Tipo de Salsa" marcado como obligatorio y aún no selecciono ninguna opción', () => {
        const requiredGroup = makeGroup({
          id: 'grp-salsa',
          name: 'Tipo de Salsa',
          is_required: true,
          min_selections: 1,
          max_selections: 1,
        });
        const product = makeProduct({ modifier_groups: [requiredGroup] });
        const selections: Record<string, Set<string>> = {
          [requiredGroup.id]: new Set(),
        };

        // Entonces el grupo muestra una etiqueta destacada "Obligatorio (elige 1)"
        const badge = getModifierGroupBadge(requiredGroup);
        expect(badge.isRequired).toBe(true);
        expect(badge.label).toBe('Obligatorio (elige 1)');

        // Y el botón principal indica "Selecciona 1 salsa" y permanece deshabilitado
        const buttonState = getActionButtonState(product.modifier_groups!, selections, product.base_price);
        expect(buttonState.isValid).toBe(false);
        expect(buttonState.buttonText).toBe('Selecciona 1 salsa');
      });
    });

    describe('Escenario: Selección completada', () => {
      it('dado que selecciono una opción válida, cuando todos los requerimientos obligatorios están cubiertos, el botón cambia a activo con "Agregar al pedido • $X.XX"', () => {
        const requiredGroup = makeGroup({
          id: 'grp-salsa',
          name: 'Tipo de Salsa',
          is_required: true,
          min_selections: 1,
          max_selections: 1,
        });
        const product = makeProduct({
          base_price: 120,
          modifier_groups: [requiredGroup],
        });

        // Selecciona la opción sin costo extra
        const selections: Record<string, Set<string>> = {
          [requiredGroup.id]: new Set(['opt-1']),
        };

        const pending = getFirstPendingRequiredGroup(product.modifier_groups!, selections);
        expect(pending).toBeNull();

        const totalPrice = calculateProductTotalPrice(product, selections);
        expect(totalPrice).toBe(120);

        const buttonState = getActionButtonState(product.modifier_groups!, selections, totalPrice);
        expect(buttonState.isValid).toBe(true);
        expect(buttonState.buttonText).toBe('Agregar al pedido • $120.00');
      });

      it('calcula el precio final con impacto de opción con extra (+ $10.00) dando "Agregar al pedido • $130.00"', () => {
        const requiredGroup = makeGroup({
          id: 'grp-salsa',
          name: 'Tipo de Salsa',
          is_required: true,
          min_selections: 1,
          max_selections: 1,
        });
        const product = makeProduct({
          base_price: 120,
          modifier_groups: [requiredGroup],
        });

        // Selecciona salsa habanero (+10)
        const selections: Record<string, Set<string>> = {
          [requiredGroup.id]: new Set(['opt-3']),
        };

        const totalPrice = calculateProductTotalPrice(product, selections);
        expect(totalPrice).toBe(130);

        const buttonState = getActionButtonState(product.modifier_groups!, selections, totalPrice);
        expect(buttonState.isValid).toBe(true);
        expect(buttonState.buttonText).toBe('Agregar al pedido • $130.00');
      });
    });

    describe('Múltiples grupos obligatorios y orden secuencial', () => {
      it('si hay múltiples grupos requeridos pendientes, guía secuencialmente en el botón de acción', () => {
        const group1 = makeGroup({ id: 'g1', name: 'Tipo de Salsa', is_required: true, min_selections: 1 });
        const group2 = makeGroup({
          id: 'g2',
          name: 'Guarnición',
          is_required: true,
          min_selections: 1,
          options: [makeOption('g-opt-1', 'Frijoles refritos')],
        });
        const product = makeProduct({ modifier_groups: [group1, group2] });

        // Ninguno seleccionado -> primer requerimiento pendiente
        let state = getActionButtonState(product.modifier_groups!, {}, product.base_price);
        expect(state.isValid).toBe(false);
        expect(state.buttonText).toBe('Selecciona 1 salsa');

        // Se selecciona el grupo 1 -> avanza al siguiente grupo pendiente
        state = getActionButtonState(
          product.modifier_groups!,
          { g1: new Set(['opt-1']) },
          product.base_price
        );
        expect(state.isValid).toBe(false);
        expect(state.buttonText).toBe('Selecciona 1 guarnición');

        // Se completan ambos -> botón activo con precio
        state = getActionButtonState(
          product.modifier_groups!,
          { g1: new Set(['opt-1']), g2: new Set(['g-opt-1']) },
          product.base_price
        );
        expect(state.isValid).toBe(true);
        expect(state.buttonText).toBe('Agregar al pedido • $120.00');
      });
    });

    describe('Microcopy dinámico de formatPendingGroupPrompt', () => {
      it('formatea nombres comunes eliminando prefijos y plurales adecuadamente', () => {
        expect(formatPendingGroupPrompt(makeGroup({ name: 'Tipo de Salsa' }), 1)).toBe('Selecciona 1 salsa');
        expect(formatPendingGroupPrompt(makeGroup({ name: 'Salsas' }), 1)).toBe('Selecciona 1 salsa');
        expect(formatPendingGroupPrompt(makeGroup({ name: 'Tipo de Pan' }), 1)).toBe('Selecciona 1 pan');
        expect(formatPendingGroupPrompt(makeGroup({ name: 'Término de la carne' }), 1)).toBe('Selecciona 1 término de la carne');
        expect(formatPendingGroupPrompt(makeGroup({ name: 'Guarniciones' }), 1)).toBe('Selecciona 1 guarnición');
        expect(formatPendingGroupPrompt(makeGroup({ name: 'Toppings' }), 2)).toBe('Selecciona 2 toppings');
      });
    });
  });

  describe('Cálculo de precios y límites de selección', () => {
    it('actualiza el total multiplicando por cantidad si es mayor a 1', () => {
      const group = makeGroup({
        id: 'extras',
        name: 'Extras',
        is_required: false,
        options: [makeOption('opt-1', 'Tocino', 20)],
      });
      const product = makeProduct({ base_price: 100, modifier_groups: [group] });
      const selections = { extras: new Set(['opt-1']) };

      expect(calculateProductTotalPrice(product, selections, 2)).toBe(240);
    });

    it('respeta tope máximo de opciones y genera advertencia inline (CA-3)', () => {
      const group = makeGroup({
        id: 'grp-toppings',
        name: 'Toppings',
        is_required: false,
        min_selections: 0,
        max_selections: 2,
        options: [
          makeOption('t1', 'Aguacate'),
          makeOption('t2', 'Cebolla'),
          makeOption('t3', 'Champiñones'),
        ],
      });

      let current = new Set<string>();
      let res = toggleGroupOption(group, current, 't1');
      expect(res.blocked).toBe(false);
      current = res.nextSelections;

      res = toggleGroupOption(group, current, 't2');
      expect(res.blocked).toBe(false);
      current = res.nextSelections;

      // Tercera opción bloqueada
      res = toggleGroupOption(group, current, 't3');
      expect(res.blocked).toBe(true);
      expect(res.limitWarning).toBe('Máximo 2 opciones permitidas');
      expect(res.nextSelections.has('t3')).toBe(false);
    });

    it('muestra "Opcional" para grupos no requeridos', () => {
      const group = makeGroup({ is_required: false, min_selections: 0, max_selections: 2 });
      const badge = getModifierGroupBadge(group);
      expect(badge.isRequired).toBe(false);
      expect(badge.label).toBe('Opcional');
    });
  });
});

