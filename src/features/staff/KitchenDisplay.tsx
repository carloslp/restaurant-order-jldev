// src/features/staff/KitchenDisplay.tsx
'use client';

import { useState, useTransition } from 'react';
import { updateOrderStatus } from '@/lib/server/order';
import { useRealtimeOrders } from '@/features/staff/useRealtimeOrders';
import type { Order } from '@/lib/types';

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
  const [error, setError] = useState<string | null>(null);

  async function handleTransition(orderId: string, nextStatus: Order['status']) {
    setError(null);
    const result = await updateOrderStatus(orderId, nextStatus);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo actualizar');
      return;
    }
    // El Realtime actualizará la lista automáticamente.
  }

  const grouped: Record<string, Order[]> = {
    CONFIRMADO_CAJA: orders.filter((o) => o.status === 'CONFIRMADO_CAJA'),
    EN_PREPARACION: orders.filter((o) => o.status === 'EN_PREPARACION'),
    LISTO: orders.filter((o) => o.status === 'LISTO'),
  };

  const columns = [
    { key: 'CONFIRMADO_CAJA', title: 'Por preparar', action: 'Comenzar' as const, next: 'EN_PREPARACION' as const },
    { key: 'EN_PREPARACION', title: 'En preparación', action: 'Listo' as const, next: 'LISTO' as const },
    { key: 'LISTO', title: 'Listos', action: null, next: null },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Pantalla de cocina</h1>
        {pending && <span className="text-sm text-gray-500">Actualizando...</span>}
      </div>
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {columns.map((col) => (
          <div key={col.key} className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-700">
              {col.title} ({grouped[col.key].length})
            </h2>
            {grouped[col.key].length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-400">
                Sin pedidos
              </p>
            ) : (
              grouped[col.key].map((order) => (
                <div
                  key={order.id}
                  className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-bold text-gray-800">
                      #{order.id.slice(0, 8).toUpperCase()}
                    </span>
                    <span className="text-xs text-gray-500">{formatTime(order.created_at)}</span>
                  </div>
                  <div className="mb-3 text-sm space-y-2">
                    {order.cart_snapshot.items.map((item, idx) => (
                      <div key={idx} className="py-1 border-b border-zinc-100 last:border-b-0">
                        <div className="flex justify-between items-start gap-2">
                          <span className="font-semibold text-zinc-900">
                            {item.quantity}× {item.product_name}
                          </span>
                          <span className="text-xs text-zinc-500 font-medium text-right pl-2">
                            {item.modifiers?.length
                              ? item.modifiers
                                  .flatMap((m) =>
                                    m.selections.map((s) => s.option_name)
                                  )
                                  .join(', ')
                              : ''}
                          </span>
                        </div>
                        {/* Comentario / Observación específica de este ítem */}
                        {item.comments && (
                          <div className="mt-1 flex items-start gap-1 text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200/90 rounded-lg px-2 py-1">
                            <span className="shrink-0 text-amber-600 font-bold">⚠️</span>
                            <span>{item.comments}</span>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Nota general de la comanda */}
                    {(order.notes || (order.cart_snapshot as any)?.notes) && (
                      <div className="mt-2 p-2.5 rounded-xl bg-orange-50/80 border border-orange-200 text-xs text-orange-950 font-medium">
                        <span className="font-bold text-orange-800 uppercase text-[10px] block tracking-wide">
                          Nota del cliente:
                        </span>
                        <span>{order.notes || (order.cart_snapshot as any)?.notes}</span>
                      </div>
                    )}
                  </div>
                  <div className="border-t pt-2">
                    <p className="mb-2 text-sm text-gray-600">
                      {order.order_type === 'DOMICILIO' ? '🚀 Delivery' : '🏃 Para llevar'} ·{' '}
                      {order.customer_name}
                    </p>
                    {col.action && col.next && (
                      <button
                        onClick={() => handleTransition(order.id, col.next)}
                        className="w-full rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 transition"
                      >
                        {col.action}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  );
}