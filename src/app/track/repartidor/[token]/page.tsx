'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getOrderByPlainToken } from '@/lib/server/order';
import { markOrderAsDeliveredByToken } from '@/lib/server/order';
import { geocodeAddressAction } from '@/lib/server/locals';
import { formatMXN } from '@/lib/pricing';
import Link from 'next/link';
import { 
  MapPin, 
  Navigation, 
  ExternalLink, 
  Phone, 
  CheckCircle2, 
  Clock, 
  Map as MapIcon, 
  Receipt, 
  AlertCircle 
} from 'lucide-react';

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
  customer_phone?: string | null;
  delivery_address: string | null;
  delivery_references: string | null;
  delivery_zone?: string | null;
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
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
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
          const tracked = res as unknown as TrackedOrder;
          setOrder(tracked);
          if (tracked.status === 'COMPLETADO') {
            setDelivered(true);
          }
          if (tracked.delivery_address) {
            geocodeAddressAction(tracked.delivery_address).then((geo) => {
              if (geo.ok && geo.coordinates) {
                setCoords(geo.coordinates);
              }
            });
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
          <div className="border-b pb-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-800 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-orange-600" />
                <span>Datos de entrega</span>
              </h2>
              {order.delivery_zone && (
                <span className="text-[11px] font-semibold bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full">
                  {order.delivery_zone}
                </span>
              )}
            </div>

            <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-2 border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-gray-400 block">Cliente</span>
                  <span className="font-semibold text-gray-800">{order.customer_name}</span>
                </div>
                {order.customer_phone && (
                  <a
                    href={`tel:${order.customer_phone}`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-2.5 py-1.5 rounded-lg transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Llamar</span>
                  </a>
                )}
              </div>

              {order.delivery_address && (
                <div>
                  <span className="text-xs text-gray-400 block">Dirección de entrega</span>
                  <p className="font-medium text-gray-800">{order.delivery_address}</p>
                </div>
              )}

              {order.delivery_references && (
                <div>
                  <span className="text-xs text-gray-400 block">Referencias</span>
                  <p className="text-xs text-gray-600 italic">{order.delivery_references}</p>
                </div>
              )}
            </div>

            {/* Mapa de destino y botón de navegación para el repartidor */}
            {order.order_type === 'DOMICILIO' && order.delivery_address && (
              <div className="space-y-2.5 pt-1">
                {/* Enlace rápido a Google Maps */}
                <a
                  href={
                    coords
                      ? `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`
                      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.delivery_address)}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold text-sm shadow-md shadow-blue-600/20 transition-all"
                >
                  <Navigation className="w-4 h-4" />
                  <span>Abrir ruta en Google Maps</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                </a>

                {/* Mapa embebido */}
                {coords ? (
                  <div className="overflow-hidden rounded-xl border border-gray-200 shadow-2xs">
                    <iframe
                      title="Ubicación de entrega"
                      width="100%"
                      height="220"
                      loading="lazy"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${coords.lng - 0.008}%2C${coords.lat - 0.006}%2C${coords.lng + 0.008}%2C${coords.lat + 0.006}&layer=mapnik&marker=${coords.lat}%2C${coords.lng}`}
                      className="w-full h-52 border-0"
                    />
                  </div>
                ) : (
                  <div className="h-36 rounded-xl border border-dashed border-gray-200 bg-gray-50/70 flex flex-col items-center justify-center text-xs text-gray-400 gap-1">
                    <MapIcon className="w-5 h-5 text-gray-300" />
                    <span>Cargando vista previa del mapa...</span>
                  </div>
                )}
              </div>
            )}
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