// src/features/staff/CashierView.tsx
'use client';

import { useState } from 'react';
import { updateOrderStatus } from '@/lib/server/order';
import { applyManualDiscount } from '@/lib/server/discounts';
import { useRealtimeOrders } from '@/features/staff/useRealtimeOrders';
import { toUserMessage } from '@/lib/errors';
import type { Order } from '@/lib/types';
import { formatMXN } from '@/lib/pricing';

interface CashierViewProps {
  locationId: string;
}

function orderTypeLabel(type: Order['order_type']): string {
  return type === 'DOMICILIO' ? '🚀 Delivery' : '🏃 Para llevar';
}

const ACTIVE_STATUSES: Order['status'][] = [
  'CREADO',
  'CONFIRMADO_CAJA',
  'EN_PREPARACION',
  'LISTO',
  'LISTO_PARA_ENTREGA',
];

export function CashierView({ locationId }: CashierViewProps) {
  const orders = useRealtimeOrders({
    locationId,
    statuses: ACTIVE_STATUSES,
    limit: 100,
  });

  const [error, setError] = useState<string | null>(null);
  const [discountingOrderId, setDiscountingOrderId] = useState<string | null>(null);
  const [manualAmount, setManualAmount] = useState('');

  async function handleAction(orderId: string, nextStatus: Order['status']) {
    setError(null);
    const result = await updateOrderStatus(orderId, nextStatus);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo actualizar');
    }
  }

  async function handleApplyManualDiscount(orderId: string) {
    const amount = parseFloat(manualAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Ingrese un monto válido mayor a 0');
      return;
    }

    setError(null);
    try {
      await applyManualDiscount(orderId, amount, 'Descuento manual en caja');
      setDiscountingOrderId(null);
      setManualAmount('');
    } catch (err) {
      setError(toUserMessage(err, 'No se pudo aplicar el descuento. Inténtalo de nuevo.'));
    }
  }

  const pendingOrders = orders.filter((o) => !['COMPLETADO', 'CANCELADO'].includes(o.status));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Caja</h1>
        <span className="text-sm text-gray-500">
          {pendingOrders.length} activos
        </span>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-3">
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
              <div className="flex-1">
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

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <span className="font-mono font-semibold text-gray-800">
                    {formatMXN(order.total)}
                  </span>
                  
                  {discountingOrderId === order.id ? (
                    <div className="mt-2 flex items-center gap-2">
                      <input 
                        type="number" 
                        value={manualAmount}
                        onChange={(e) => setManualAmount(e.target.value)}
                        className="w-20 rounded border border-gray-300 px-2 py-1 text-xs" 
                        placeholder="$"
                      />
                      <button 
                        onClick={() => handleApplyManualDiscount(order.id)}
                        className="text-xs bg-green-600 text-white px-2 py-1 rounded"
                      >
                        OK
                      </button>
                      <button 
                        onClick={() => {setDiscountingOrderId(null); setManualAmount('');}}
                        className="text-xs bg-gray-200 px-2 py-1 rounded"
                      >
                        X
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setDiscountingOrderId(order.id)}
                      className="ml-2 text-xs text-indigo-600 hover:underline"
                    >
                      Descuento
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
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
            </div>
          ))
        )}
      </div>

      <p className="text-xs text-green-600">
        ● Realtime activo — los cambios se reflejan al instante.
      </p>
    </div>
  );
}
