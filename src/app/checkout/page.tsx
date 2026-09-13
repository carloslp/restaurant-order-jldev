// src/app/checkout/page.tsx
'use client';

import { useCart } from '@/features/cart/CartContext';
import { formatMXN, linePrice } from '@/lib/pricing';
import { CheckoutForm } from '@/features/checkout/CheckoutForm';
import type { OrderType, PaymentMethod } from '@/lib/types';

export default function CheckoutPage() {
  const { cart, total, count } = useCart();

  if (cart.items.length === 0) {
    return (
      <div className="min-h-flex flex-col items-center justify-center py-20">
        <p className="text-gray-500 text-center">Tu carrito está vacío. <a href="/" className="text-orange-600 hover:underline">Volver al menú</a></p>
      </div>
    );
  }

  const orderType: OrderType = 'DOMICILIO';
  const paymentMethod: PaymentMethod = 'EFECTIVO_EXACTO';
  const eta = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="mb-4 text-2xl font-bold">Resumen del pedido</h1>
      <div className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Artículos ({count})</h2>
        <div className="space-y-4">
          {cart.items.map((item) => {
            const flatMods = item.modifiers.flatMap((m) =>
              m.selections.map((s) => ({
                price_impact: s.price_impact,
                quantity: s.quantity,
              }))
            );
            const itemTotal = linePrice({
              base_price: item.base_price,
              quantity: item.quantity,
              modifiers: flatMods,
            });
            return (
              <div key={item.product_id} className="flex justify-between">
                <span>{item.product_name} x{item.quantity}</span>
                <span className="font-mono">{formatMXN(itemTotal)}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 pt-4 border-t">
          <div className="flex justify-between">
            <span>Total</span>
            <span className="font-bold text-lg">{formatMXN(total)}</span>
          </div>
        </div>
      </div>
      <CheckoutForm
        orderType={orderType}
        paymentMethod={paymentMethod}
        eta={eta}
      />
    </div>
  );
}