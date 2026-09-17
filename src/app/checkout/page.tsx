// src/app/checkout/page.tsx
'use client';

import { useCart } from '@/features/cart/CartContext';
import { formatMXN, linePrice } from '@/lib/pricing';
import { CheckoutForm } from '@/features/checkout/CheckoutForm';
import type { OrderType, PaymentMethod } from '@/lib/types';
import { useState, useMemo } from 'react';
import { useProductAvailability } from '@/features/menu/useProductAvailability';
import Link from 'next/link';

export default function CheckoutPage() {
  const { cart, total, count } = useCart();

  // Obtener locationId del subdominio en el cliente
  const locationId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const host = window.location.hostname;
    return host.split('.')[0].toLowerCase();
  }, []);

  const productIds = useMemo(() => cart.items.map(item => item.product_id), [cart.items]);
  const { availability, isLoading: availabilityLoading, areAllAvailable, getUnavailableProducts } = useProductAvailability({
    locationId,
    productIds,
    enabled: !!locationId && productIds.length > 0,
  });

  const allAvailable = areAllAvailable(productIds);
  const unavailableProducts = getUnavailableProducts(productIds);

  const [orderType, setOrderType] = useState<OrderType>('RECOGER');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('EFECTIVO_EXACTO');
  const [eta] = useState(() => new Date(Date.now() + 30 * 60 * 1000).toISOString());

  if (cart.items.length === 0) {
    return (
      <div className="min-h-flex flex-col items-center justify-center py-20">
        <p className="text-gray-500 text-center">Tu carrito está vacío. <Link href="/" className="text-orange-600 hover:underline">Volver al menú</Link></p>
      </div>
    );
  }

  return (
      <div className="max-w-4xl mx-auto p-6">
        {/* Alerta de productos no disponibles */}
        {availabilityLoading && (
          <div className="mb-4 rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800">
            Verificando disponibilidad de productos...
          </div>
        )}
        {!availabilityLoading && !allAvailable && (
                  <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
                    <p className="font-medium mb-1">Los siguientes productos ya no están disponibles:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      {unavailableProducts.map((id) => {
                        const item = cart.items.find(i => i.product_id === id);
                        return <li key={id}>{item?.product_name ?? id}</li>;
                      })}
                    </ul>
                    <p className="mt-2">Por favor, actualice su carrito <Link href="/" className="text-red-600 underline">volviendo al menú</Link>.</p>
                  </div>
                )}

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
              const isAvailable = availability[item.product_id] ?? true;
              return (
                <div key={item.product_id} className={`flex justify-between ${!isAvailable ? 'opacity-50 line-through text-gray-400' : ''}`}>
                  <span>
                    {item.product_name} x{item.quantity}
                    {!isAvailable && <span className="ml-2 text-xs text-red-600">(No disponible)</span>}
                  </span>
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
                    {/* Leyenda "IVA incluido" visible siempre (LFPC Art. 76 Bis) */}
                    <div className="mt-2 flex items-center justify-end gap-1.5 text-xs text-gray-500">
                      <span className="rounded bg-gray-100 px-2 py-0.5 font-medium">IVA incluido (16%)</span>
                    </div>
                  </div>
        </div>
        <div className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">Detalles del pedido</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tipo de orden</label>
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={orderType === 'RECOGER'}
                    onChange={(e) => setOrderType('RECOGER')}
                    className="h-4 w-4 text-orange-600"
                  />
                  <span className="ml-2">Para recoger</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={orderType === 'DOMICILIO'}
                    onChange={(e) => setOrderType('DOMICILIO')}
                    className="h-4 w-4 text-orange-600"
                  />
                  <span className="ml-2">A domicilio</span>
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Método de pago</label>
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={paymentMethod === 'EFECTIVO_EXACTO'}
                    onChange={(e) => setPaymentMethod('EFECTIVO_EXACTO')}
                    className="h-4 w-4 text-orange-600"
                  />
                  <span className="ml-2">Efectivo exacto</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={paymentMethod === 'EFECTIVO_CON_CAMBIO'}
                    onChange={(e) => setPaymentMethod('EFECTIVO_CON_CAMBIO')}
                    className="h-4 w-4 text-orange-600"
                  />
                  <span className="ml-2">Efectivo con cambio</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={paymentMethod === 'TARJETA_CONTRA_ENTREGA'}
                    onChange={(e) => setPaymentMethod('TARJETA_CONTRA_ENTREGA')}
                    className="h-4 w-4 text-orange-600"
                  />
                  <span className="ml-2">Tarjeta contra entrega</span>
                </label>
              </div>
            </div>
          </div>
        </div>
        {!availabilityLoading && allAvailable && (
          <CheckoutForm
            orderType={orderType}
            paymentMethod={paymentMethod}
            eta={eta}
          />
        )}
        {!availabilityLoading && !allAvailable && (
          <div className="text-center text-red-600">
            No se puede procesar el pedido mientras haya productos no disponibles.
          </div>
        )}
      </div>
    );
}