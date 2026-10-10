// Utilidades de validación contextual para CheckoutForm (Feature F-UI-01)

export interface ValidationContext {
  orderType: 'DOMICILIO' | 'RECOGER' | 'EN_MESA';
}

/**
 * Valida un campo individual del checkout y devuelve un mensaje de corrección contextual o null si es válido.
 * CA-1: Validación inline al perder foco (onBlur) para campos obligatorios.
 */
export function validateCheckoutField(
  name: string,
  value: string | null | undefined,
  context: ValidationContext
): string | null {
  const val = (value ?? '').trim();

  // En comanda de mesa, el nombre es opcional
  if (context.orderType === 'EN_MESA' && name === 'customer_name') {
    if (val.length > 100) {
      return 'El nombre o alias es demasiado largo (máximo 100 caracteres)';
    }
    return null;
  }

  switch (name) {
    case 'customer_name': {
      if (!val) {
        return 'El nombre es obligatorio (mínimo 2 letras)';
      }
      if (val.length < 2) {
        return 'El nombre debe tener al menos 2 caracteres';
      }
      return null;
    }

    case 'customer_phone': {
      if (!val) {
        return 'El teléfono es obligatorio para contactarte';
      }
      const digitsOnly = val.replace(/\D/g, '');
      if (digitsOnly.length < 10) {
        return 'Ingresa un teléfono válido de al menos 10 dígitos';
      }
      return null;
    }

    case 'delivery_address': {
      if (context.orderType === 'DOMICILIO') {
        if (!val) {
          return 'La dirección de entrega es obligatoria';
        }
        if (val.length < 5) {
          return 'Ingresa una dirección completa (calle, número y colonia)';
        }
      }
      return null;
    }

    case 'notes': {
      if (val.length > 500) {
        return 'Las notas no deben exceder 500 caracteres';
      }
      return null;
    }

    default:
      return null;
  }
}

/**
 * Valida todos los campos requeridos para el paso 1 del checkout.
 */
export function validateStepOne(
  form: Record<string, string | null | undefined>,
  context: ValidationContext
): Record<string, string> {
  const errors: Record<string, string> = {};

  const nameError = validateCheckoutField('customer_name', form.customer_name, context);
  if (nameError) errors.customer_name = nameError;

  if (context.orderType !== 'EN_MESA') {
    const phoneError = validateCheckoutField('customer_phone', form.customer_phone, context);
    if (phoneError) errors.customer_phone = phoneError;
  }

  if (context.orderType === 'DOMICILIO') {
    const addressError = validateCheckoutField('delivery_address', form.delivery_address, context);
    if (addressError) errors.delivery_address = addressError;
  }

  return errors;
}

export const CHECKOUT_SESSION_STORAGE_KEY = 'restaurant-order-jldev:checkout-session-form';

/**
 * Filtra los campos no confidenciales para persistencia segura en sessionStorage.
 * CA-3: Campos no confidenciales (nombre, teléfono, notas del pedido, dirección).
 */
export function getSafePersistableData(
  form: Record<string, string | null | undefined>
): Record<string, string> {
  return {
    customer_name: (form.customer_name ?? '').trim(),
    customer_phone: (form.customer_phone ?? '').trim(),
    delivery_address: (form.delivery_address ?? '').trim(),
    delivery_references: (form.delivery_references ?? '').trim(),
    notes: (form.notes ?? '').trim(),
    promo_code: (form.promo_code ?? '').trim(),
  };
}
