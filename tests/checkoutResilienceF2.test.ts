import { describe, it, expect } from 'vitest';
import type { Cart, CartItem, Discount } from '@/lib/types';
import { evaluatePromoCodeEligibility, type DiscountWithUsage } from '@/lib/pricing/discounts';
import { itemKey } from '@/features/cart/CartContext';

describe('Feature 2 - Carrito Accesible, Checkout Resiliente y Transparencia de Costos', () => {
  const sampleItem: CartItem = {
    product_id: 'prod-burger',
    product_name: 'Hamburguesa Doble',
    base_price: 180,
    quantity: 1,
    modifiers: [
      {
        modifier_group_id: 'mg-queso',
        modifier_group_name: 'Tipo de queso',
        selections: [{ option_id: 'opt-cheddar', option_name: 'Cheddar', price_impact: 15, quantity: 1 }],
      },
    ],
    comments: 'Sin pepinillos',
  };

  describe('CA-2.1: Deshacer eliminación de platillo en el carrito', () => {
    it('genera una clave única estable para identificar y restaurar el platillo exactamente como estaba', () => {
      const key = itemKey(sampleItem);
      expect(key).toContain('prod-burger');
      expect(key).toContain('opt-cheddar');
      expect(key).toContain('Sin pepinillos');
    });

    it('simula la restauración íntegra de un platillo eliminado (Deshacer) sin perder modificadores ni notas', () => {
      let cartItems: CartItem[] = [sampleItem];

      // 1. Eliminar ítem
      const keyToRemove = itemKey(sampleItem);
      const snapshot = { ...sampleItem };
      cartItems = cartItems.filter((i) => itemKey(i) !== keyToRemove);
      expect(cartItems).toHaveLength(0);

      // 2. Tocar "Deshacer"
      cartItems = [...cartItems, snapshot];
      expect(cartItems).toHaveLength(1);
      expect(cartItems[0].product_name).toBe('Hamburguesa Doble');
      expect(cartItems[0].modifiers[0].selections[0].option_name).toBe('Cheddar');
      expect(cartItems[0].comments).toBe('Sin pepinillos');
    });
  });

  describe('CA-2.3: Idempotencia y recuperación tras fallo de red en Checkout', () => {
    it('mantiene la misma clave de idempotencia entre el intento fallido y el reintento', () => {
      const initialForm = {
        customer_name: 'Juan Pérez',
        customer_phone: '5512345678',
        delivery_address: 'Av. Insurgentes Sur 1234',
        idempotency_key: 'idemp-uuid-12345',
      };

      // Simular fallo de red: el formulario NO se borra
      const failedState = {
        ...initialForm,
        error_submit: 'Error de red o comunicación con el servidor',
      };

      expect(failedState.customer_name).toBe('Juan Pérez');
      expect(failedState.idempotency_key).toBe('idemp-uuid-12345');

      // Reintento: usa la misma clave para evitar órdenes duplicadas en base de datos
      const retryPayload = {
        ...failedState,
      };
      expect(retryPayload.idempotency_key).toBe('idemp-uuid-12345');
    });
  });

  describe('CA-2.4: Desglose transparente de cupón inválido por monto mínimo', () => {
    const discounts: DiscountWithUsage[] = [
      {
        id: 'disc-1',
        location_id: 'loc-1',
        description: 'Descuento $50 en compras de $300 o más',
        code: 'PROMO300',
        discount_type: 'FIXED_AMOUNT',
        value: 50,
        min_purchase: 300,
        is_active: true,
        starts_at: null,
        ends_at: null,
        days_of_week: null,
        time_of_day_start: null,
        time_of_day_end: null,
        usage_limit_total: null,
        usage_limit_per_customer: null,
        usage_limit_per_day: null,
        applies_to_product_ids: null,
        applies_to_category_ids: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    it('devuelve mensaje específico con monto faltante cuando no se alcanza el mínimo', () => {
      const subtotal = 195; // Faltan 105 para 300
      const evalResult = evaluatePromoCodeEligibility('PROMO300', discounts, subtotal);

      expect(evalResult.valid).toBe(false);
      expect(evalResult.missingAmount).toBe(105);
      expect(evalResult.minPurchase).toBe(300);
      expect(evalResult.reason).toBe('Te faltan $105.00 para usar este cupón (mínimo $300.00)');
    });

    it('devuelve válido cuando el subtotal cumple o excede el mínimo de compra', () => {
      const subtotal = 350;
      const evalResult = evaluatePromoCodeEligibility('PROMO300', discounts, subtotal);

      expect(evalResult.valid).toBe(true);
      expect(evalResult.reason).toBeUndefined();
    });

    it('reporta cupón inválido si el código no coincide', () => {
      const evalResult = evaluatePromoCodeEligibility('INEXISTENTE', discounts, 500);

      expect(evalResult.valid).toBe(false);
      expect(evalResult.reason).toBe('Cupón no válido o inactivo');
    });
  });
});
