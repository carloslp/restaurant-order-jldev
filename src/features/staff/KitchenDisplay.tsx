// src/features/staff/KitchenDisplay.tsx
// Feature F-03: Ergonomía Táctil y Modo Alta Demanda en Kitchen Display System (KDS)
'use client';

import { useState, useEffect, useTransition } from 'react';
import { updateOrderStatus } from '@/lib/server/order';
import { useRealtimeOrders } from '@/features/staff/useRealtimeOrders';
import {
  getElapsedMinutes,
  getKdsCardVisuals,
  getKdsActionConfig,
} from '@/features/staff/kdsUtils';
import type { Order } from '@/lib/types';
import { Loader2 } from 'lucide-react';

interface KitchenDisplayProps {
  locationId: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

const ACTIVE_STATUSES: Order['status'][] = ['CONFIRMADO_CAJA', 'EN_PREPARACION', 'LISTO'];

export function KitchenDisplay({ locationId }: KitchenDisplayProps) {
  // Pedidos en tiempo real (Realtime + estado inicial)
  const orders = useRealtimeOrders({
    locationId,
    statuses: ACTIVE_STATUSES,
    limit: 100,
  });

  const [pending, startTransition] = useTransition();
  const [pendingOrder, setPendingOrder] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  // Actualizador en vivo de tiempo transcurrido cada 15 segundos para alertas en KDS
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  async function handleTransition(orderId: string, nextStatus: Order['status']) {
    setError(null);
    setPendingOrder(orderId);
    try {
      const result = await updateOrderStatus(orderId, nextStatus);
      if (!result.ok) {
        setError(result.error ?? 'No se pudo actualizar');
      }
    } catch {
      setError('Error de comunicación al actualizar la comanda');
    } finally {
      setPendingOrder(null);
    }
  }

  const grouped: Record<string, Order[]> = {
    CONFIRMADO_CAJA: orders.filter((o) => o.status === 'CONFIRMADO_CAJA'),
    EN_PREPARACION: orders.filter((o) => o.status === 'EN_PREPARACION'),
    LISTO: orders.filter((o) => o.status === 'LISTO'),
  };

  const columns = [
    { key: 'CONFIRMADO_CAJA', title: 'Por preparar' },
    { key: 'EN_PREPARACION', title: 'En preparación' },
    { key: 'LISTO', title: 'Listos' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">
            Pantalla de Cocina (KDS)
          </h1>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Comandas activas en tiempo real para preparación y despacho
          </p>
        </div>
        {(pending || pendingOrder) && (
          <div className="flex items-center gap-1.5 text-xs text-orange-600 font-bold bg-orange-50 px-3 py-1.5 rounded-full border border-orange-200">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Actualizando comanda...</span>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-sm text-red-700 font-medium">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {columns.map((col) => (
          <div key={col.key} className="space-y-3">
            <div className="flex items-center justify-between border-b border-gray-200 pb-2">
              <h2 className="text-base font-bold text-gray-800">
                {col.title}
              </h2>
              <span className="text-xs font-black px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                {grouped[col.key].length}
              </span>
            </div>

            {grouped[col.key].length === 0 ? (
              <p className="rounded-2xl border-2 border-dashed border-gray-200 p-8 text-center text-sm font-medium text-gray-400">
                Sin pedidos en esta columna
              </p>
            ) : (
              grouped[col.key].map((order) => {
                const elapsedMinutes = getElapsedMinutes(order.created_at, now);
                // CA-1: Alerta visual por tiempo de espera (>15 min ámbar, >25 min rojo parpadeante suave)
                const visuals = getKdsCardVisuals(order.status, elapsedMinutes);
                // CA-2: Botón de avance táctil grande (ancho completo y min-height >= 56px)
                const actionConfig = getKdsActionConfig(col.key, order.order_type);
                const isTransitioning = pendingOrder === order.id;

                return (
                  <div
                    key={order.id}
                    className={`rounded-2xl ${visuals.borderClass} ${visuals.bgClass} ${visuals.pulseClass} flex flex-col justify-between shadow-xs transition-all overflow-hidden`}
                  >
                    <div className="p-4 sm:p-5 flex-1">
                      {/* Cabecera del ticket */}
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono font-black text-lg text-gray-900 block leading-tight">
                            #{order.id.slice(0, 8).toUpperCase()}
                          </span>
                          <span className="text-xs text-gray-500 font-medium">
                            Hora: {formatTime(order.created_at)}
                          </span>
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          {order.status === 'EN_PREPARACION' && (
                            <span
                              className={`text-xs font-black px-2 py-0.5 rounded-md ${
                                visuals.urgencyLevel === 'urgent'
                                  ? 'bg-red-100 text-red-900 border border-red-300'
                                  : visuals.urgencyLevel === 'warning'
                                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                    : 'bg-zinc-100 text-zinc-700 border border-zinc-200'
                              }`}
                            >
                              ⏱️ {elapsedMinutes} min
                            </span>
                          )}

                          {/* Indicador estático de urgencia accesible */}
                          {visuals.staticIndicator && (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] ${visuals.badgeClass}`}
                            >
                              {visuals.staticIndicator}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Modalidad y cliente */}
                      <div className="mb-3">
                        {order.order_type === 'EN_MESA' ? (
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-100 text-orange-950 font-extrabold text-xs sm:text-sm border border-orange-200">
                              🍽️ {order.customer_name}
                            </span>
                            <span className="text-[11px] font-bold text-orange-700 uppercase tracking-wider">
                              Comanda Salón
                            </span>
                          </div>
                        ) : (
                          <p className="text-xs sm:text-sm text-gray-700 font-bold">
                            {order.order_type === 'DOMICILIO' ? '🚀 Delivery' : '🏃 Para llevar'} · {order.customer_name}
                          </p>
                        )}
                      </div>

                      {/* Lista de platillos y notas */}
                      <div className="text-sm space-y-2 border-t border-gray-100 pt-2.5">
                        {order.cart_snapshot.items.map((item, idx) => (
                          <div key={idx} className="py-1 border-b border-zinc-100 last:border-b-0">
                            <div className="flex justify-between items-start gap-2">
                              <span className="font-extrabold text-zinc-900">
                                {item.quantity}× {item.product_name}
                              </span>
                              <span className="text-xs text-zinc-600 font-semibold text-right pl-2">
                                {item.modifiers?.length
                                  ? item.modifiers
                                      .flatMap((m) =>
                                        m.selections.map((s) => s.option_name)
                                      )
                                      .join(', ')
                                  : ''}
                              </span>
                            </div>
                            {/* Comentario específico de preparación de este ítem */}
                            {item.comments && (
                              <div className="mt-1 flex items-start gap-1 text-xs font-bold text-amber-950 bg-amber-100/80 border border-amber-300 rounded-lg px-2.5 py-1">
                                <span className="shrink-0 text-amber-700">⚠️</span>
                                <span>{item.comments}</span>
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Nota general de la comanda */}
                        {(order.notes || (order.cart_snapshot as any)?.notes) && (
                          <div className="mt-2.5 p-2.5 rounded-xl bg-orange-50/90 border border-orange-200 text-xs text-orange-950 font-medium">
                            <span className="font-extrabold text-orange-800 uppercase text-[10px] block tracking-wide">
                              Nota de Comanda:
                            </span>
                            <span>{order.notes || (order.cart_snapshot as any)?.notes}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* CA-2: Botón de avance táctil grande (ancho completo y altura mínima >= 56px) */}
                    {actionConfig && (
                      <div className="mt-2 w-full pt-0 border-t border-gray-100">
                        <button
                          type="button"
                          disabled={isTransitioning}
                          onClick={() => handleTransition(order.id, actionConfig.nextStatus)}
                          className={`w-full min-h-[56px] px-4 py-3.5 flex items-center justify-center gap-2 text-sm sm:text-base font-extrabold uppercase tracking-wider text-white select-none touch-manipulation active:scale-[0.98] transition-all cursor-pointer ${actionConfig.buttonClass} ${
                            isTransitioning
                              ? 'opacity-60 cursor-not-allowed pointer-events-none'
                              : ''
                          }`}
                        >
                          {isTransitioning ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              <span>Actualizando...</span>
                            </>
                          ) : (
                            <span>{actionConfig.actionLabel}</span>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ))}
      </div>
    </div>
  );
}