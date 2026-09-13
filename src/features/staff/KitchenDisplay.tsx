// src/features/staff/KitchenDisplay.tsx
'use client';

import { useState, useTransition } from 'react';
import { updateOrderStatus, listOrdersForLocation } from '@/lib/server/order';
import type { Order } from '@/lib/types';
import { formatMXN } from '@/lib/pricing';

interface KitchenDisplayProps {
  orders: Order[];
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(status: Order['status']): string {
  const labels: Record<Order['status'], string> = {
    CREADO: 'Recibido',
    CONFIRMADO_CAJA: 'Confirmado',
    EN_PREPARACION: 'En preparación',
    LISTO: 'Listo',
    LISTO_PARA_ENTREGA: 'Listo para entrega',
    COMPLETADO: 'Entregado',
    CANCELADO: 'Cancelado',
  };
  return labels[status] ?? status;
}

export function KitchenDisplay({ orders: initialOrders }: KitchenDisplayProps) {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleTransition(orderId: string, nextStatus: Order['status']) {
    setError(null);
    const result = await updateOrderStatus(orderId, nextStatus);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo actualizar');
      return;
    }
    // Refrescar la lista (server action) para reflejar el estado.
    startTransition(async () => {
      const fresh = await listOrdersForLocation({
        statuses: ['CONFIRMADO_CAJA', 'EN_PREPARACION', 'LISTO'],
      });
      setOrders(fresh);
    });
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
        {pending && <span className="text-sm text-gray-500">Refrescando...</span>}
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
                      #{order.cart_snapshot.items.reduce((sum, item) => sum + item.quantity, 0)}
                    </span>
                    <span className="text-xs text-gray-500">{formatTime(order.created_at)}</span>
                  </div>
                  <div className="mb-3 text-sm">
                    {order.cart_snapshot.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between py-0.5">
                        <span>
                          {item.quantity}× {item.product_name}
                        </span>
                        <span className="text-gray-500">
                          {item.modifiers?.length
                            ? item.modifiers
                                .flatMap((m) =>
                                  m.selections.map((s) => s.option_name)
                                )
                                .join(', ')
                            : ''}
                        </span>
                      </div>
                    ))}
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