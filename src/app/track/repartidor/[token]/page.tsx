'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getOrderByPlainToken } from '@/lib/server/order';
import { markOrderAsDeliveredByToken } from '@/lib/server/order';
import { formatMXN } from '@/lib/pricing';
import Link from 'next/link';

type OrderStatus =
  | 'CREADO'
  | 'CONFIRMADO_CAJA'
  | 'EN_PREPARACION'
  | 'LISTO'
  | 'LISTO_PARA_ENTREGA'
  | 'COMPLETADO'
  | 'CANCELADO';

interface TrackedOrder {
  id: string;
  status: OrderStatus;
  customer_name: string;
  delivery_address: string | null;
  delivery_references: string | null;
  order_type: string;
  payment_method: string;
  eta: string;
  total: number;
  cart_snapshot: {
    version: string;
    items: Array<{
      product_name: string;
      quantity: number;
      base_price: number;
    }>;
  };
  delivered_at: string | null;
}

export default function RepartidorTrackingPage() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? '';

  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [delivered, setDelivered] = useState(false);
  const [delivering, setDelivering] = useState(false);

  useEffect(() => {
    async function fetchOrder() {
      try {
        setLoading(true);
        setError(null);
        const res = await getOrderByPlainToken(token);
        if (res) {
          setOrder(res as unknown as TrackedOrder);
          if ((res as unknown as TrackedOrder).status === 'COMPLETADO') {
            setDelivered(true);
          }
        } else {
          setError('Orden no encontrada o token inválido');
        }
      } catch (err) {
        setError('Error al obtener la orden');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    if (token) fetchOrder();
  }, [token]);

  const handleMarkAsDelivered = async () => {
    if (delivering) return;
    setDelivering(true);
    setError(null);
    try {
      const res = await markOrderAsDeliveredByToken(token);
      if (res.ok) {
        setDelivered(true);
        if (order) {
          setOrder({ ...order, status: 'COMPLETADO', delivered_at: new Date().toISOString() });
        }
      } else {
        setError(res.error || 'Error al marcar como entregado');
      }
    } catch (err) {
      setError('Error de red o servidor');
      console.error(err);
    } finally {
      setDelivering(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
        <p className="mt-4 text-gray-500">Cargando...</p>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-xl shadow-md p-8 text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link href="/" className="text-orange-600 hover:underline">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  if (!order) return null;

  const statusLabels: Record<string, string> = {
    CREADO: 'Pedido recibido',
    CONFIRMADO_CAJA: 'Confirmado en caja',
    EN_PREPARACION: 'En preparación',
    LISTO: 'Listo para retirar',
    LISTO_PARA_ENTREGA: 'Listo para entrega',
    COMPLETADO: 'Entregado',
    CANCELADO: 'Cancelado',
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">
          🚴 Tracking de Repartidor
        </h1>

        <div className="bg-white rounded-xl shadow-md p-6 space-y-4">
          {/* Estado */}
          <div className={`p-4 rounded-lg ${delivered ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'}`}>
            <p className={`font-semibold ${delivered ? 'text-green-700' : 'text-orange-700'}`}>
              {statusLabels[order.status] ?? order.status}
            </p>
            {delivered && (
              <p className="text-sm text-green-600 mt-1">
                Entregado exitosamente ✓
              </p>
            )}
          </div>

          {/* Detalles de entrega */}
          <div className="border-b pb-4">
            <h2 className="font-semibold text-gray-700 mb-2">Datos de entrega</h2>
            <p className="text-sm text-gray-600">
              <span className="font-medium">Cliente:</span> {order.customer_name}
            </p>
            {order.delivery_address && (
              <p className="text-sm text-gray-600 mt-1">
                <span className="font-medium">Dirección:</span> {order.delivery_address}
              </p>
            )}
            {order.delivery_references && (
              <p className="text-sm text-gray-600 mt-1">
                <span className="font-medium">Referencias:</span> {order.delivery_references}
              </p>
            )}
            <p className="text-sm text-gray-600 mt-1">
              <span className="font-medium">Tipo:</span> {order.order_type === 'DOMICILIO' ? 'Domicilio' : 'Recoger'}
            </p>
          </div>

          {/* Items del pedido */}
          <div className="border-b pb-4">
            <h2 className="font-semibold text-gray-700 mb-2">Artículos</h2>
            {order.cart_snapshot?.items?.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm py-1">
                <span>{item.product_name} ×{item.quantity}</span>
                <span className="font-mono">{formatMXN(item.base_price * item.quantity)}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold pt-2 border-t mt-2">
              <span>Total</span>
              <span className="font-mono">{formatMXN(order.total)}</span>
            </div>
          </div>

          {/* Método de pago */}
          <div className="pb-4">
            <h2 className="font-semibold text-gray-700 mb-1">Pago</h2>
            <p className="text-sm text-gray-600">
              {order.payment_method === 'EFECTIVO_EXACTO' && 'Efectivo (exacto)'}
              {order.payment_method === 'EFECTIVO_CON_CAMBIO' && 'Efectivo (con cambio)'}
              {order.payment_method === 'TARJETA_CONTRA_ENTREGA' && 'Tarjeta contra entrega'}
            </p>
          </div>

          {/* Botón de acción */}
          {!delivered && order.status !== 'CANCELADO' && (
            <button
              onClick={handleMarkAsDelivered}
              disabled={delivering}
              className="w-full rounded-lg bg-green-600 px-6 py-3 text-white font-semibold hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {delivering ? 'Procesando...' : '✓ Marcar como Entregado'}
            </button>
          )}

          {delivered && (
            <div className="text-center py-4">
              <p className="text-lg font-bold text-green-600">¡Entrega completada!</p>
              <Link href="/" className="inline-block mt-3 text-orange-600 hover:underline text-sm">
                Volver al inicio
              </Link>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 text-center mt-2">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}