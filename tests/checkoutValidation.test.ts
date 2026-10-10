import { describe, it, expect } from 'vitest';
import {
  validateCheckoutField,
  validateStepOne,
  getSafePersistableData,
  CHECKOUT_SESSION_STORAGE_KEY,
} from '@/features/checkout/checkoutValidation';

describe('FEATURE F-UI-01: Rediseño Progresivo del Checkout Móvil (CheckoutForm.tsx)', () => {
  describe('CA-1 – Validación inline al perder foco (onBlur)', () => {
    it('teléfono vacío o incompleto produce mensaje contextual de corrección', () => {
      const emptyError = validateCheckoutField('customer_phone', '', { orderType: 'DOMICILIO' });
      expect(emptyError).toBe('El teléfono es obligatorio para contactarte');

      const shortError = validateCheckoutField('customer_phone', '55123', { orderType: 'DOMICILIO' });
      expect(shortError).toBe('Ingresa un teléfono válido de al menos 10 dígitos');

      const validResult = validateCheckoutField('customer_phone', '55 1234 5678', { orderType: 'DOMICILIO' });
      expect(validResult).toBeNull();
    });

    it('dirección de entrega vacía o demasiado corta produce mensaje contextual para pedidos a domicilio', () => {
      const emptyError = validateCheckoutField('delivery_address', '', { orderType: 'DOMICILIO' });
      expect(emptyError).toBe('La dirección de entrega es obligatoria');

      const shortError = validateCheckoutField('delivery_address', 'Av 1', { orderType: 'DOMICILIO' });
      expect(shortError).toBe('Ingresa una dirección completa (calle, número y colonia)');

      const validResult = validateCheckoutField('delivery_address', 'Av. Reforma 222, Juárez', {
        orderType: 'DOMICILIO',
      });
      expect(validResult).toBeNull();
    });

    it('dirección no es obligatoria para pedidos para recoger', () => {
      const error = validateCheckoutField('delivery_address', '', { orderType: 'RECOGER' });
      expect(error).toBeNull();
    });

    it('nombre obligatorio de al menos 2 letras', () => {
      const empty = validateCheckoutField('customer_name', '', { orderType: 'DOMICILIO' });
      expect(empty).toBe('El nombre es obligatorio (mínimo 2 letras)');

      const singleChar = validateCheckoutField('customer_name', 'J', { orderType: 'DOMICILIO' });
      expect(singleChar).toBe('El nombre debe tener al menos 2 caracteres');

      const valid = validateCheckoutField('customer_name', 'Ana García', { orderType: 'DOMICILIO' });
      expect(valid).toBeNull();
    });
  });

  describe('CA-2 – Validación de paso 1 y método de entrega', () => {
    it('valida paso 1 completo para entrega a domicilio', () => {
      const invalidForm = {
        customer_name: '',
        customer_phone: '123',
        delivery_address: '',
      };

      const errors = validateStepOne(invalidForm, { orderType: 'DOMICILIO' });
      expect(errors.customer_name).toBeDefined();
      expect(errors.customer_phone).toBeDefined();
      expect(errors.delivery_address).toBeDefined();
    });

    it('valida paso 1 completo para entrega en sucursal (no requiere dirección)', () => {
      const validPickupForm = {
        customer_name: 'Carlos Mendoza',
        customer_phone: '55 9876 5432',
        delivery_address: '',
      };

      const errors = validateStepOne(validPickupForm, { orderType: 'RECOGER' });
      expect(Object.keys(errors).length).toBe(0);
    });
  });

  describe('CA-3 – Prevención de pérdida de datos por recarga (sessionStorage)', () => {
    it('filtra y prepara los campos no confidenciales para persistencia segura en sessionStorage', () => {
      const formData = {
        customer_name: '  Lucía Ramos  ',
        customer_phone: '  5544332211  ',
        delivery_address: 'Calle Durango 40, Roma',
        delivery_references: 'Portón gris',
        notes: 'Timbre no funciona',
        promo_code: 'BIENVENIDO10',
        idempotency_key: 'idemp-123',
      };

      const safePersisted = getSafePersistableData(formData);
      expect(safePersisted.customer_name).toBe('Lucía Ramos');
      expect(safePersisted.customer_phone).toBe('5544332211');
      expect(safePersisted.delivery_address).toBe('Calle Durango 40, Roma');
      expect(safePersisted.notes).toBe('Timbre no funciona');
      expect(CHECKOUT_SESSION_STORAGE_KEY).toBeDefined();
    });
  });
});
