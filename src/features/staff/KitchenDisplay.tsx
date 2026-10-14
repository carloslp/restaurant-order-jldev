// src/features/staff/KitchenDisplay.tsx
// Feature F-03: Ergonomía Táctil y Modo Alta Demanda en Kitchen Display System (KDS)
'use client';

import { useState, useEffect, useTransition, useCallback, useRef } from 'react';
import { updateOrderStatus } from '@/lib/server/order';
import { useRealtimeOrders } from '@/features/staff/useRealtimeOrders';
import {
  getElapsedMinutes,
  getKdsCardVisuals,
  getKdsActionConfig,
  playNewOrderChime,
  playAlertTone,
} from '@/features/staff/kdsUtils';
import type { Order } from '@/lib/types';
import { Loader2, Ban, UtensilsCrossed, Volume2, VolumeX, AlertCircle, RotateCcw } from 'lucide-react';
import { ProductAvailabilityManager } from '@/features/staff/ProductAvailabilityManager';

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

interface UndoableAction {
  orderId: string;
  orderNumber: string;
  previousStatus: Order['status'];
  nextStatus: Order['status'];
  rollback: () => void;
  timeoutId: NodeJS.Timeout;
}

export function KitchenDisplay({ locationId }: KitchenDisplayProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(null);
  const highlightTimerRef = useRef<NodeJS.Timeout | null>(null);

  // CA-1: Alerta sonora en nueva comanda recibida (440 Hz -> 880 Hz, 150 ms c/u) y resaltado transitorio (1.5 s)
  const handleNewOrder = useCallback(
    (order: Order) => {
      void playNewOrderChime({ isMuted });

      setHighlightedOrderId(order.id);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => {
        setHighlightedOrderId(null);
      }, 1500);
    },
    [isMuted]
  );

  // Pedidos en tiempo real (Realtime + estado inicial)
  const orders = useRealtimeOrders({
    locationId,
    statuses: ACTIVE_STATUSES,
    limit: 100,
    onNewOrder: handleNewOrder,
  });

  const [pending, startTransition] = useTransition();
  const [pendingOrder, setPendingOrder] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [isAvailabilityOpen, setIsAvailabilityOpen] = useState(false);

  // CA-3.1: Estado para Deshacer cambio de estado accidental con ventana de gracia de 4 segundos
  const [activeUndo, setActiveUndo] = useState<UndoableAction | null>(null);

  // CA-3.2: Alerta sonora cuando cae la conexión en tiempo real
  const prevReconnecting = useRef(false);
  useEffect(() => {
    if (orders.isReconnecting && !prevReconnecting.current) {
      void playAlertTone({ isMuted });
    }
    prevReconnecting.current = Boolean(orders.isReconnecting);
  }, [orders.isReconnecting, isMuted]);

  const pendingCommitsRef = useRef<
    Map<
      string,
      {
        timeoutId: ReturnType<typeof setTimeout>;
        commit: () => Promise<void>;
        rollback: () => void;
      }
    >
  >(new Map());

  // CA-4: Limpieza segura de timers y flush de commits pendientes para evitar pérdida de datos
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 15000);
    return () => {
      clearInterval(timer);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      // Vaciar y confirmar de inmediato en base de datos cualquier comanda pendiente de commit
      for (const item of pendingCommitsRef.current.values()) {
        clearTimeout(item.timeoutId);
        void item.commit();
      }
      pendingCommitsRef.current.clear();
    };
  }, []);

  async function handleTransition(orderId: string, nextStatus: Order['status']) {
    setError(null);
    const targetOrder = orders.find((o) => o.id === orderId);
    if (!targetOrder) return;

    const previousStatus = targetOrder.status;

    // Mutación optimista inmediata
    const rollback = orders.mutateOrderStatusOptimistic?.(orderId, nextStatus);

    // Si había una orden previa con Undo activo, la confirmamos inmediatamente en BD
    // para que la nueva orden tome la barra de Deshacer sin riesgo de perder la anterior
    if (activeUndo && activeUndo.orderId !== orderId) {
      const prevPending = pendingCommitsRef.current.get(activeUndo.orderId);
      if (prevPending) {
        clearTimeout(prevPending.timeoutId);
        void prevPending.commit();
        pendingCommitsRef.current.delete(activeUndo.orderId);
      }
    }

    const commitFunction = async () => {
      try {
        const result = await updateOrderStatus(orderId, nextStatus);
        if (!result.ok) {
          rollback?.();
          setError(result.error ?? 'No se pudo actualizar la comanda');
        }
      } catch {
        rollback?.();
        setError('Error de comunicación al actualizar la comanda');
      } finally {
        pendingCommitsRef.current.delete(orderId);
        setActiveUndo((curr) => (curr?.orderId === orderId ? null : curr));
      }
    };

    // Ventana de 4 segundos antes de enviar mutación a base de datos
    const timeoutId = setTimeout(() => {
      void commitFunction();
    }, 4000);

    const rollbackWrapper = () => {
      clearTimeout(timeoutId);
      pendingCommitsRef.current.delete(orderId);
      rollback?.();
      setActiveUndo((curr) => (curr?.orderId === orderId ? null : curr));
    };

    pendingCommitsRef.current.set(orderId, {
      timeoutId,
      commit: commitFunction,
      rollback: rollbackWrapper,
    });

    setActiveUndo({
      orderId,
      orderNumber: targetOrder.id.slice(0, 6).toUpperCase(),
      previousStatus,
      nextStatus,
      rollback: rollbackWrapper,
      timeoutId,
    });
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">
            Pantalla de Cocina (KDS)
          </h1>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Comandas activas en tiempo real para preparación y despacho
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Control manual de volumen / silencio en pantalla (CA-1 & ENABLER E-02) */}
          <button
            type="button"
            onClick={() => setIsMuted((m) => !m)}
            className="min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-xs active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
            aria-label={isMuted ? 'Activar sonido de comandas' : 'Silenciar sonido de comandas'}
            title={isMuted ? 'Sonido desactivado. Clic para activar' : 'Sonido activado. Clic para silenciar'}
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-red-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            )}
            <span>{isMuted ? 'Silenciado' : 'Sonido ON'}</span>
          </button>

          {/* CA-1 & CA-8: Botón contextual de disponibilidad rápida en KDS (mínimo 44x44 px) */}
          <button
            type="button"
            onClick={() => setIsAvailabilityOpen(true)}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-xs active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
          >
            <Ban className="w-4 h-4 text-red-400" />
            <span>Agotados (86) / Menú</span>
          </button>

          {(pending || pendingOrder) && (
            <div className="flex items-center gap-1.5 text-xs text-orange-600 font-bold bg-orange-50 px-3 py-1.5 rounded-full border border-orange-200">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Actualizando comanda...</span>
            </div>
          )}
        </div>
      </div>

      {/* CA-3.2: Alerta de pérdida de conexión en tiempo real */}
      {orders.isReconnecting && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-xl bg-amber-500 text-amber-950 px-4 py-3 font-extrabold text-sm flex items-center justify-between gap-2 shadow-sm animate-pulse border border-amber-600"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0 text-amber-950" />
            <span>Sin conexión en vivo — Reintentando conectar...</span>
          </div>
          <button
            type="button"
            onClick={() => orders.refresh?.()}
            className="text-xs bg-amber-950 text-white px-3 py-1.5 rounded-lg hover:bg-black font-bold transition-colors cursor-pointer"
          >
            Reconectar
          </button>
        </div>
      )}

      {/* CA-3.1: Barra de Deshacer cambio de estado accidental con ventana de 4 segundos */}
      {activeUndo && (
        <div
          role="status"
          aria-live="assertive"
          className="rounded-2xl bg-[#1c1917] text-white p-3.5 sm:p-4 shadow-xl border-2 border-[#d9480f] flex items-center justify-between gap-4 animate-in slide-in-from-top-2 duration-200"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#d9480f]/20 text-[#f97316] flex items-center justify-center font-bold text-sm shrink-0">
              <RotateCcw className="w-5 h-5 text-[#f97316]" />
            </div>
            <div>
              <p className="text-sm font-bold">
                Comanda #{activeUndo.orderNumber} movida a <span className="text-[#f97316] font-extrabold">{activeUndo.nextStatus}</span>
              </p>
              <p className="text-xs text-stone-400">
                ¿Fue un toque accidental? Tienes 4 segundos para revertir antes de guardar.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => activeUndo.rollback()}
            className="min-h-[48px] px-6 py-2.5 rounded-xl bg-[#d9480f] hover:bg-[#b83807] active:scale-95 text-white font-bold text-sm tracking-normal shadow-md transition-all cursor-pointer shrink-0"
          >
            Deshacer
          </button>
        </div>
      )}

      {/* Modal de disponibilidad rápida */}
      <ProductAvailabilityManager
        locationId={locationId}
        isOpen={isAvailabilityOpen}
        onClose={() => setIsAvailabilityOpen(false)}
      />

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
                // CA-2: Semáforo visual en 3 niveles (Normal, Advertencia #D97706, Crítico #DC2626/#FEF2F2)
                const visuals = getKdsCardVisuals(order.status, elapsedMinutes);
                // CA-2: Botón de avance táctil grande (ancho completo y min-height >= 56px)
                const actionConfig = getKdsActionConfig(col.key, order.order_type);
                const isTransitioning = pendingOrder === order.id;
                // CA-1: Resaltado transitorio de 1.5s
                const isHighlighted = highlightedOrderId === order.id;

                return (
                  <div
                    key={order.id}
                    className={`rounded-2xl ${visuals.borderClass} ${visuals.bgClass} ${visuals.pulseClass} ${
                      isHighlighted ? 'ring-4 ring-amber-400 scale-[1.02] shadow-xl z-10' : ''
                    } flex flex-col justify-between shadow-xs transition-all overflow-hidden animate-in fade-in zoom-in-95 duration-200`}
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