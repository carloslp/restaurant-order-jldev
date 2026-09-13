// Utilidades de precio: todos los precios públicos incluyen IVA.
// El IVA interno se calcula con la fórmula: iva = subtotal * rate/(1+rate).

export interface PricingInput {
  base_price: number; // precio público del producto (IVA incluido)
  quantity: number;
  modifiers: { price_impact: number; quantity: number }[];
  iva_rate: number; // ej. 0.16
  delivery_fee: number; // tarifa fija del local
}

export interface PricingResult {
  items_subtotal: number; // suma de precio público de los ítems
  subtotal: number; // items_subtotal + delivery_fee
  iva_amount: number; // IVA interno: subtotal * rate/(1+rate)
  total: number; // subtotal (público, IVA incluido)
}

/** Precio de un ítem: base + impactos de modificadores seleccionados */
export function linePrice(input: {
  base_price: number;
  quantity: number;
  modifiers: { price_impact: number; quantity: number }[];
}): number {
  const itemPrice = input.base_price +
    input.modifiers.reduce((sum, m) => sum + m.price_impact * m.quantity, 0);
  return itemPrice * input.quantity;
}

/**
 * Calcula los totales de un pedido.
 * - items_subtotal: suma de precios públicos (IVA incluido) de los ítems.
 * - subtotal: items_subtotal + delivery_fee (el envío también lleva IVA incluido).
 * - iva_amount: IVA interno = subtotal * rate/(1+rate).
 * - total: subtotal (todo está en precio público).
 */
export function pricing(input: PricingInput): PricingResult {
  const items_subtotal = input.base_price >= 0
    ? input.quantity * input.base_price + input.modifiers.reduce((s, m) => s + m.price_impact * m.quantity, 0)
    : 0;
  const subtotal = items_subtotal + input.delivery_fee;
  const iva_amount = round2(subtotal * (input.iva_rate / (1 + input.iva_rate)));
  const total = round2(subtotal);
  return { items_subtotal, subtotal, iva_amount, total };
}

/** Redondeo a 2 decimales */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Formatea un número como moneda MXN */
export function formatMXN(n: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(n);
}