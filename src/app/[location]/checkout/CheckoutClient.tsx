// src/app/[location]/checkout/CheckoutClient.tsx
'use client';

import { useCart, itemKey } from '@/features/cart/CartContext';
import { formatMXN, linePrice } from '@/lib/pricing';
import { CheckoutForm } from '@/features/checkout/CheckoutForm';
import type { OrderType, PaymentMethod } from '@/lib/types';
import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { getPublicTableStatus } from '@/lib/server/tables';
import { useProductAvailability } from '@/features/menu/useProductAvailability';
import Link from 'next/link';
import { 
  ArrowLeft, 
  ShoppingBag, 
  Store, 
  Bike, 
  Banknote, 
  Coins, 
  CreditCard, 
  AlertCircle, 
  ShieldCheck, 
  Clock,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Receipt,
  ExternalLink
} from 'lucide-react';

interface CheckoutClientProps {
  locationId: string;
  slug: string; // slug de la location (para volver al menú)
}

export default function CheckoutClient({ locationId, slug }: CheckoutClientProps) {
  const { cart, total, count, updateQuantity, removeItem, clearCart } = useCart();
  const [createdOrder, setCreatedOrder] = useState<{
    orderId: string;
    trackToken?: string;
    orderType: OrderType;
    paymentMethod: PaymentMethod;
  } | null>(null);

  // El locationId llega del server (resuelto por path) — sin lógica de hostname.
  const productIds = useMemo(() => cart.items.map((item) => item.product_id), [cart.items]);
  const {
    availability,
    isLoading: availabilityLoading,
    areAllAvailable,
    getUnavailableProducts,
  } = useProductAvailability({
    locationId,
    productIds,
    enabled: !!locationId && productIds.length > 0,
  });

  const allAvailable = areAllAvailable(productIds);
  const unavailableProducts = getUnavailableProducts(productIds);

  const searchParams = useSearchParams();
  const mesaParam = searchParams.get('mesa');
  const tokenParam = searchParams.get('token');
  const [tableData, setTableData] = useState<{ id: string; table_number: string; qr_status: string; zone?: string; current_session_id?: string | null } | null>(null);

  const [orderType, setOrderType] = useState<OrderType>('RECOGER');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('EFECTIVO_EXACTO');
  const [eta] = useState(() => new Date(Date.now() + 30 * 60 * 1000).toISOString());
  const [estimatedDeliveryFee, setEstimatedDeliveryFee] = useState<number>(0);
  const [deliveryZone, setDeliveryZone] = useState<string | null>(null);
  const [isDeliverable, setIsDeliverable] = useState<boolean>(true);

  useEffect(() => {
    if (mesaParam) {
      getPublicTableStatus(slug, mesaParam, tokenParam || undefined)
        .then((res) => {
          if (res.ok && res.table) {
            setTableData(res.table);
            setOrderType('EN_MESA');
          }
        })
        .catch(() => {});
    }
  }, [mesaParam, tokenParam, slug]);

  // Si el pedido se acaba de crear, mostramos la pantalla de éxito
  if (createdOrder) {
    const isMesa = createdOrder.orderType === 'EN_MESA';
    const displayId = createdOrder.orderId.slice(0, 8).toUpperCase();
    const tableNum = tableData?.table_number || mesaParam || '';
    const returnUrl = isMesa && tableNum
      ? `/${slug}?mesa=${encodeURIComponent(tableNum)}${tokenParam ? `&token=${encodeURIComponent(tokenParam)}` : ''}`
      : `/${slug}`;

    return (
      <div className="min-h-[85vh] flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95 duration-300">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4 ring-8 ring-emerald-50">
          <CheckCircle2 className="w-9 h-9" />
        </div>
        <h2 className="text-2xl font-extrabold text-zinc-900 tracking-tight">
          {isMesa ? '¡Comanda Enviada a Cocina!' : '¡Pedido Recibido con Éxito!'}
        </h2>
        <p className="text-sm text-zinc-500 mt-1 max-w-sm mx-auto">
          {isMesa
            ? `Tu comanda para la Mesa ${tableNum} ya está en preparación en cocina. Puedes ordenar más platillos o bebidas en cualquier momento.`
            : 'Ya enviamos tu pedido a preparación. Tu carrito se ha limpiado correctamente.'}
        </p>

        {/* Tarjeta de Recibo */}
        <div className="mt-6 w-full max-w-sm mx-auto bg-white border border-zinc-200/80 rounded-2xl p-5 text-left shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-200/80">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5 text-orange-600" /> Número de Comanda
            </span>
            <span className="font-mono font-extrabold text-base text-zinc-900">
              #{displayId}
            </span>
          </div>

          <div className="pt-3 space-y-2 text-xs text-zinc-600">
            <div className="flex justify-between">
              <span className="text-zinc-400">Modalidad:</span>
              <span className="font-semibold text-zinc-800">
                {isMesa
                  ? `🍽️ Consumo en Salón · Mesa ${tableNum}`
                  : createdOrder.orderType === 'DOMICILIO'
                  ? '🛵 Entrega a Domicilio'
                  : '🏪 Para Recoger en Local'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Pago:</span>
              <span className="font-semibold text-zinc-800">
                {isMesa
                  ? 'Cuenta acumulada de Mesa'
                  : createdOrder.paymentMethod === 'TARJETA_CONTRA_ENTREGA'
                  ? 'Terminal / Tarjeta'
                  : createdOrder.paymentMethod === 'EFECTIVO_CON_CAMBIO'
                    ? 'Efectivo con cambio'
                    : 'Efectivo exacto'}
              </span>
            </div>
          </div>
        </div>

        {/* Links de seguimiento y retorno */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-sm">
          {!isMesa && createdOrder.trackToken && (
            <Link
              href={`/track/${createdOrder.trackToken}`}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-orange-600/25 hover:bg-orange-700 active:scale-95 transition-all"
            >
              <span>Ver seguimiento en vivo</span>
              <ExternalLink className="w-4 h-4" />
            </Link>
          )}

          <Link
            href={returnUrl}
            className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold active:scale-95 transition-all ${
              isMesa
                ? 'bg-orange-600 hover:bg-orange-700 text-white shadow-md shadow-orange-600/25'
                : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
            }`}
          >
            {isMesa ? '🍽️ Seguir pidiendo / Volver a la carta' : 'Volver a la carta'}
          </Link>
        </div>
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mb-4 shadow-sm">
          <ShoppingBag className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-zinc-900">Tu carrito está vacío</h2>
        <p className="text-sm text-zinc-500 mt-1 max-w-sm">
          Aún no has agregado ningún platillo a tu pedido.
        </p>
        <Link
          href={`/${slug}`}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-600/20 hover:bg-orange-700 active:scale-95 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a la carta
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FBFBFB] py-6 sm:py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Barra superior de navegación */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href={`/${slug}`}
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-zinc-600 hover:text-zinc-900 bg-white border border-zinc-200/80 px-3 py-1.5 rounded-xl shadow-2xs hover:bg-zinc-50 active:scale-95 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver al menú</span>
          </Link>
          <div className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-orange-500" />
            <span>Tiempo estimado: 25 - 40 min</span>
          </div>
        </div>

        {/* Alerta de productos no disponibles */}
        {availabilityLoading && (
          <div className="mb-6 rounded-2xl bg-amber-50 border border-amber-200/80 p-4 text-xs sm:text-sm text-amber-800 flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
            <span>Verificando disponibilidad de los productos con cocina...</span>
          </div>
        )}

        {!availabilityLoading && !allAvailable && (
          <div className="mb-6 rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-800">
            <div className="flex items-center gap-2 font-bold mb-1 text-red-900">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <span>Algunos platillos ya no están disponibles:</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-xs sm:text-sm ml-6 text-red-700">
              {unavailableProducts.map((id) => {
                const item = cart.items.find((i) => i.product_id === id);
                return <li key={id}>{item?.product_name ?? id}</li>;
              })}
            </ul>
            <p className="mt-3 text-xs">
              Por favor{' '}
              <Link href={`/${slug}`} className="font-bold underline text-red-900">
                regresa al menú
              </Link>{' '}
              para actualizar tu selección.
            </p>
          </div>
        )}

        {/* Layout en dos columnas responsive */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Columna principal: Opciones de entrega, pago y formulario */}
          <div className="lg:col-span-7 space-y-6">
            {/* 1. Tipo de entrega o Cabecera Comanda */}
            {orderType === 'EN_MESA' ? (
              /* En comanda de mesa no se ven otros tipos de entrega */
              <div className="bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50/40 rounded-2xl border border-orange-200/90 p-4 sm:p-5 shadow-xs">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-orange-600 text-white flex items-center justify-center text-xl shadow-md shadow-orange-600/25 shrink-0">
                    🍽️
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-black uppercase tracking-wider text-orange-800">
                        Comanda en Salón
                      </span>
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                        ● Envío Directo a Cocina
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-black text-zinc-900 mt-0.5 truncate">
                      Mesa {tableData?.table_number || mesaParam} {tableData?.zone ? `(${tableData.zone})` : ''}
                    </h2>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Tus platillos se enviarán directo a cocina. La cuenta permanecerá abierta.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-zinc-200/80 p-5 sm:p-6 shadow-xs">
                <h2 className="text-base font-bold text-zinc-900 mb-3 flex items-center gap-2">
                  <span>1. Tipo de entrega</span>
                </h2>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setOrderType('RECOGER')}
                    className={`flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all select-none active:scale-[0.98] ${
                      orderType === 'RECOGER'
                        ? 'border-orange-600 bg-orange-50/40 ring-2 ring-orange-600/20 text-zinc-900'
                        : 'border-zinc-200 hover:border-zinc-300 text-zinc-600'
                    }`}
                  >
                    <Store
                      className={`w-6 h-6 mb-1.5 ${orderType === 'RECOGER' ? 'text-orange-600' : 'text-zinc-400'}`}
                    />
                    <span className="text-xs sm:text-sm font-bold">Para recoger</span>
                    <span className="text-[11px] text-zinc-400 mt-0.5">En el local</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOrderType('DOMICILIO')}
                    className={`flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all select-none active:scale-[0.98] ${
                      orderType === 'DOMICILIO'
                        ? 'border-orange-600 bg-orange-50/40 ring-2 ring-orange-600/20 text-zinc-900'
                        : 'border-zinc-200 hover:border-zinc-300 text-zinc-600'
                    }`}
                  >
                    <Bike
                      className={`w-6 h-6 mb-1.5 ${orderType === 'DOMICILIO' ? 'text-orange-600' : 'text-zinc-400'}`}
                    />
                    <span className="text-xs sm:text-sm font-bold">A domicilio</span>
                    <span className="text-[11px] text-zinc-400 mt-0.5">Entrega rápida</span>
                  </button>
                </div>
              </div>
            )}

            {/* 2. Método de pago */}
            {orderType === 'EN_MESA' ? (
              <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 sm:p-5 shadow-xs flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Receipt className="w-5 h-5" />
                </div>
                <div className="text-xs text-zinc-600">
                  <span className="font-bold text-zinc-900 block text-sm">Pago de la cuenta al finalizar</span>
                  <span>Pide la cuenta a tu mesero o paga en caja al terminar tu consumo. Tus órdenes van directo a cocina.</span>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-zinc-200/80 p-5 sm:p-6 shadow-xs">
                <h2 className="text-base font-bold text-zinc-900 mb-3">
                  2. Método de pago al recibir
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('EFECTIVO_EXACTO')}
                    className={`flex items-center sm:flex-col sm:justify-center gap-3 sm:gap-1.5 p-3 sm:p-3.5 rounded-xl border text-left sm:text-center transition-all select-none active:scale-[0.98] ${
                      paymentMethod === 'EFECTIVO_EXACTO'
                        ? 'border-orange-600 bg-orange-50/40 ring-2 ring-orange-600/20 text-zinc-900'
                        : 'border-zinc-200 hover:border-zinc-300 text-zinc-600'
                    }`}
                  >
                    <Banknote
                      className={`w-5 h-5 shrink-0 ${paymentMethod === 'EFECTIVO_EXACTO' ? 'text-orange-600' : 'text-zinc-400'}`}
                    />
                    <div>
                      <span className="text-xs sm:text-sm font-bold block">Efectivo exacto</span>
                      <span className="text-[10px] sm:text-[11px] text-zinc-400 block sm:inline">Sin cambio</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('EFECTIVO_CON_CAMBIO')}
                    className={`flex items-center sm:flex-col sm:justify-center gap-3 sm:gap-1.5 p-3 sm:p-3.5 rounded-xl border text-left sm:text-center transition-all select-none active:scale-[0.98] ${
                      paymentMethod === 'EFECTIVO_CON_CAMBIO'
                        ? 'border-orange-600 bg-orange-50/40 ring-2 ring-orange-600/20 text-zinc-900'
                        : 'border-zinc-200 hover:border-zinc-300 text-zinc-600'
                    }`}
                  >
                    <Coins
                      className={`w-5 h-5 shrink-0 ${paymentMethod === 'EFECTIVO_CON_CAMBIO' ? 'text-orange-600' : 'text-zinc-400'}`}
                    />
                    <div>
                      <span className="text-xs sm:text-sm font-bold block">Con cambio</span>
                      <span className="text-[10px] sm:text-[11px] text-zinc-400 block sm:inline">Llevar cambio</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('TARJETA_CONTRA_ENTREGA')}
                    className={`flex items-center sm:flex-col sm:justify-center gap-3 sm:gap-1.5 p-3 sm:p-3.5 rounded-xl border text-left sm:text-center transition-all select-none active:scale-[0.98] ${
                      paymentMethod === 'TARJETA_CONTRA_ENTREGA'
                        ? 'border-orange-600 bg-orange-50/40 ring-2 ring-orange-600/20 text-zinc-900'
                        : 'border-zinc-200 hover:border-zinc-300 text-zinc-600'
                    }`}
                  >
                    <CreditCard
                      className={`w-5 h-5 shrink-0 ${paymentMethod === 'TARJETA_CONTRA_ENTREGA' ? 'text-orange-600' : 'text-zinc-400'}`}
                    />
                    <div>
                      <span className="text-xs sm:text-sm font-bold block">Terminal / Tarjeta</span>
                      <span className="text-[10px] sm:text-[11px] text-zinc-400 block sm:inline">Al recibir</span>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* 3. Datos del cliente y confirmación */}
            <div className="bg-white rounded-2xl border border-zinc-200/80 p-5 sm:p-6 shadow-xs">
              <h2 className="text-base font-bold text-zinc-900 mb-4">
                {orderType === 'EN_MESA' ? '2. Datos para cocina' : '3. Tus datos de contacto'}
              </h2>

              {!availabilityLoading && allAvailable && (
                <CheckoutForm
                  locationId={locationId}
                  slug={slug}
                  orderType={orderType}
                  tableId={tableData?.id}
                  tableNumber={tableData?.table_number || mesaParam}
                  sessionId={tableData?.current_session_id}
                  paymentMethod={paymentMethod}
                  eta={eta}
                  onSuccess={(orderId, trackToken) => {
                    setCreatedOrder({
                      orderId,
                      trackToken,
                      orderType,
                      paymentMethod,
                    });
                  }}
                  onDeliveryEstimationChange={(fee, zone, deliverable) => {
                    setEstimatedDeliveryFee(fee);
                    setDeliveryZone(zone);
                    setIsDeliverable(deliverable);
                  }}
                />
              )}

              {!availabilityLoading && !allAvailable && (
                <div className="text-center py-6 text-sm text-red-600 bg-red-50 rounded-xl p-4">
                  Por favor, elimina los productos agotados para poder continuar con el pedido.
                </div>
              )}
            </div>
          </div>

          {/* Columna lateral: Resumen del Pedido tipo Ticket */}
          <aside className="lg:col-span-5">
            <div className="bg-white rounded-2xl border border-zinc-200/80 p-5 sm:p-6 shadow-xs sticky top-20">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3 mb-4">
                <h3 className="font-bold text-zinc-900 text-base flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-orange-600" />
                  <span>Resumen ({count} {count === 1 ? 'ítem' : 'ítems'})</span>
                </h3>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => clearCart()}
                    className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-red-600 transition-colors"
                    title="Vaciar todo el carrito"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Vaciar</span>
                  </button>
                  <Link
                    href={`/${slug}`}
                    className="text-xs font-semibold text-orange-600 hover:text-orange-700"
                  >
                    + Agregar
                  </Link>
                </div>
              </div>

              <div className="space-y-3.5 max-h-80 overflow-y-auto pr-1">
                {cart.items.map((item) => {
                  const key = itemKey(item);
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
                    <div
                      key={key}
                      className={`text-xs sm:text-sm pb-3 border-b border-zinc-100 last:border-0 ${
                        !isAvailable ? 'opacity-40 line-through text-zinc-400' : ''
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="font-medium text-zinc-800">
                          <span className="font-bold text-zinc-900 mr-1.5">{item.quantity}x</span>
                          <span>{item.product_name}</span>
                          {!isAvailable && (
                            <span className="ml-2 text-[10px] text-red-600 font-semibold no-underline">
                              (Agotado)
                            </span>
                          )}
                        </div>
                        <span className="font-bold text-zinc-900 shrink-0">
                          {formatMXN(itemTotal)}
                        </span>
                      </div>

                      {/* Modificadores desglosados */}
                      {item.modifiers.length > 0 && (
                        <div className="mt-1 pl-5 space-y-0.5 text-[11px] text-zinc-400">
                          {item.modifiers.map((m) =>
                            m.selections.map((s) => (
                              <div key={s.option_id} className="flex justify-between">
                                <span>+ {s.option_name}</span>
                                {s.price_impact > 0 && (
                                  <span>+{formatMXN(s.price_impact * s.quantity)}</span>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      {/* Controles de edición de cantidad y eliminación */}
                      <div className="flex items-center justify-between mt-2 pt-1 border-t border-zinc-100/60">
                        <div className="flex items-center bg-zinc-100/90 rounded-lg p-0.5 border border-zinc-200/70">
                          <button
                            type="button"
                            onClick={() => {
                              if (item.quantity <= 1) {
                                removeItem(key);
                              } else {
                                updateQuantity(key, item.quantity - 1);
                              }
                            }}
                            className="w-6 h-6 rounded flex items-center justify-center text-zinc-600 hover:text-zinc-900 active:bg-zinc-200 transition-colors"
                            aria-label="Disminuir cantidad"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center font-bold text-xs text-zinc-800 select-none">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(key, item.quantity + 1)}
                            className="w-6 h-6 rounded flex items-center justify-center text-zinc-600 hover:text-zinc-900 active:bg-zinc-200 transition-colors"
                            aria-label="Aumentar cantidad"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeItem(key)}
                          className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-red-600 transition-colors p-1 rounded hover:bg-red-50"
                          aria-label="Eliminar producto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Eliminar</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Totales y desglose */}
              {(() => {
                const activeDeliveryFee = orderType === 'DOMICILIO' ? estimatedDeliveryFee : 0;
                const finalTotal = total + activeDeliveryFee;

                return (
                  <div className="mt-4 pt-4 border-t border-zinc-100 space-y-2">
                    <div className="flex justify-between text-xs text-zinc-500">
                      <span>Subtotal productos</span>
                      <span>{formatMXN(total)}</span>
                    </div>

                    {orderType === 'DOMICILIO' && (
                      <div className="flex justify-between text-xs text-zinc-600">
                        <span className="flex items-center gap-1.5">
                          <span>Envío a domicilio</span>
                          {deliveryZone && (
                            <span className="text-[10px] font-semibold bg-orange-50 text-orange-700 border border-orange-200/60 px-1.5 py-0.5 rounded-md">
                              {deliveryZone}
                            </span>
                          )}
                        </span>
                        <span className="font-semibold text-zinc-800">
                          {estimatedDeliveryFee > 0 ? formatMXN(estimatedDeliveryFee) : '$0.00'}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between items-baseline pt-2 border-t border-zinc-100">
                      <span className="text-sm font-bold text-zinc-900">Total a pagar</span>
                      <span className="text-xl font-extrabold text-orange-600">
                        {formatMXN(finalTotal)}
                      </span>
                    </div>

                    {/* Leyenda legal IVA */}
                    <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-zinc-400">
                      <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Precios en MXN · IVA incluido (16%)</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}