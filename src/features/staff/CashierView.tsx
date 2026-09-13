// src/features/staff/CashierView.tsx
'use client';

import { useState, useTransition } from 'react';
import { updateOrderStatus } from '@/lib/server/order';
import type { Order } from '@/lib/types';
import { formatMXN } from '@/lib/pricing';

interface CashierViewProps {
  orders: Order[];
}

function orderTypeLabel(type: Order['order_type']): string {
  return type === 'DOMICILIO' ? '🚀 Delivery' : '🏃 Para llevar';
}

export function CashierView({ orders: initialOrders }: CashierViewProps) {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleAction(orderId: string, nextStatus: Order['status']) {
    setError(null);
    const result = await updateOrderStatus(orderId, nextStatus);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo actualizar');
      return;
    }
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? { ...o, status: nextStatus }
          : o
      )
    );
  }

  const pendingOrders = orders.filter((o) => !['COMPLETADO', 'CANCELADO'].includes(o.status));
  const completedOrders = orders.filter((o) => ['COMPLETADO', 'CANCELADO'].includes(o.status));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Caja</h1>
        {pending && <span className="text-sm text-gray-500">Procesando...</span>}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Pedidos activos */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-700">
          Pedidos activos ({pendingOrders.length})
        </h2>
        {pendingOrders.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
            No hay pedidos activos.
          </p>
        ) : (
          pendingOrders.map((order) => (
            <div
              key={order.id}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-bold text-gray-800">
                    #{order.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      order.status === 'CREADO'
                        ? 'bg-blue-100 text-blue-700'
                        : order.status === 'CONFIRMADO_CAJA'
                          ? 'bg-amber-100 text-amber-700'
                          : order.status === 'EN_PREPARACION'
                            ? 'bg-purple-100 text-purple-700'
                            : order.status === 'LISTO'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {order.status}
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  {orderTypeLabel(order.order_type)} · {order.customer_name}
                  {order.order_type === 'DOMICILIO' && order.delivery_address
                    ? ` · ${order.delivery_address}`
                    : ''}
                </p>
                <p className="text-xs text-gray-400">
                  {order.cart_snapshot.items.length} líneas · ETA{' '}
                  {new Date(order.eta).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-gray-800">
                  {formatMXN(order.total)}
                </span>
                {/* Acciones por estado */}
                {order.status === 'CREADO' && (
                  <button
                    onClick={() => handleAction(order.id, 'CONFIRMADO_CAJA')}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition"
                  >
                    Confirmar
                  </button>
                )}
                {order.status === 'CONFIRMADO_CAJA' && (
                  <button
                    onClick={() => handleAction(order.id, 'EN_PREPARACION')}
                    className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 transition"
                  >
                    A cocina
                  </button>
                )}
                {order.status === 'LISTO' && (
                  <button
                    onClick={() => handleAction(order.id, 'LISTO_PARA_ENTREGA')}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 transition"
                  >
                    {order.order_type === 'DOMICILIO' ? 'Enviar a entrega' : 'Marcar retirado'}
                  </button>
                )}
                {order.status === 'LISTO_PARA_ENTREGA' &&
                  order.order_type === 'DOMICILIO' && (
                    <button
                      onClick={() => handleAction(order.id, 'COMPLETADO')}
                      className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 transition"
                    >
                      Entregado
                    </button>
                  )}
                <button
                  onClick={() => handleAction(order.id, 'CANCELADO')}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 transition"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Completados / cancelados */}
      {completedOrders.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-500">
            Historial ({completedOrders.length})
          </h3>
          {completedOrders.map((order) => (
            <div
              key={order.id}
              className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2 text-sm text-gray-500"
            >
              <span>
                #{order.id.slice(0, 8).toUpperCase()} · {order.customer_name} ·{' '}
                {order.status.toLowerCase()}
              </span>
              <span className="font-mono">{formatMXN(order.total)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}