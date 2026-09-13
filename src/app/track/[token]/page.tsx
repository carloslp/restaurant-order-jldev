// src/app/track/[token]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { formatMXN } from '@/lib/pricing';
import { getOrderByDeliveryToken, markOrderAsDeliveredByToken } from '@/lib/server/order';

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
  eta: string; // ISO
  total: number;
  created_at: string;
  delivered_at: string | null;
}

export default function TrackPage() {
  const pathname = usePathname();
  const router = useRouter();
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [mode, setMode] = useState<'client' | 'repartidor' | 'unknown'>('unknown');
  const [delivering, setDelivering] = useState<boolean>(false);
  const [completed, setCompleted] = useState<boolean>(false);

  // Extract token from pathname: /track/<token>
  const token = pathname.split('/').pop() ?? '';

  useEffect(() => {
    if (!token) {
      setError('Token no proporcionado');
      setMode('unknown');
      setLoading(false);
      return;
    }

    // Try to fetch as client order (delivery_token is UUID)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
    if (isUUID) {
      setMode('client');
      fetchClientOrder(token);
    } else {
      // Assume it's a repartidor token (plain token)
      setMode('repartidor');
      setLoading(false);
    }
  }, [pathname, token]);

  async function fetchClientOrder(deliveryToken: string) {
    try {
      setLoading(true);
      const orderData = await getOrderByDeliveryToken(deliveryToken);
      if (!orderData) {
        setError('Orden no encontrada o token inválido');
        setLoading(false);
        return;
      }
      const o = orderData;
      setOrder({
        id: o.id,
        status: o.status as OrderStatus,
        eta: o.eta,
        total: o.total,
        created_at: o.created_at,
        delivered_at: o.delivered_at ?? null,
      });
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError('Error al obtener la orden');
      setLoading(false);
    }
  }

  async function handleComplete() {
    if (mode !== 'repartidor' || delivering) return;
    setDelivering(true);
    setError(null);
    try {
      const result = await markOrderAsDeliveredByToken(token);
      if (!result.ok) {
        setError(result.error ?? 'Error desconocido');
        return;
      }
      setCompleted(true);
    } catch (err) {
      console.error(err);
      setError((err as Error).message ?? 'Error al completar');
    } finally {
      setDelivering(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center p-6">
        <h1 className="mb-4 text-2xl font-bold text-gray-600">Cargando...</h1>
      </div>
    );
  }

  if (mode === 'unknown') {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center p-6">
        <h1 className="mb-4 text-2xl font-bold text-gray-600">Seguimiento de pedido</h1>
        <p className="text-center text-gray-500 max-w-md">
          {error ? (
            <>
              <p className="mb-2 text-red-600">{error}</p>
              <p className="mb-4">
                Asegurate de que el link sea correcto y no haya expirado.
              </p>
            </>
          ) : (
            <>
              <p className="mb-2">
                Proporcioná un token de seguimiento válido.
              </p>
              <p className="mb-4 text-sm">
                Ejemplo: <code className="bg-gray-100 px-1 rounded">?token=UUID</code> para clientes o
                <code className="bg-gray-100 px-1 rounded">?token=PLAIN</code> para repartidores.
              </p>
            </>
          )}
        </p>
      </div>
    );
  }

  if (mode === 'client') {
    if (!order) {
      return (
        <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center p-6">
          <h1 className="mb-4 text-2xl font-bold text-gray-600">Cargando...</h1>
        </div>
      );
    }

    const statusText: Record<OrderStatus, string> = {
      CREADO: 'Pedido recibido',
      CONFIRMADO_CAJA: 'Confirmado en caja',
      EN_PREPARACION: 'En preparación',
      LISTO: 'Listo para retirar',
      LISTO_PARA_ENTREGA: 'Listo para entrega',
      COMPLETADO: 'Entregado',
      CANCELADO: 'Cancelado',
    };

    const etaDate = new Date(order.eta);
    const etaFormatted = etaDate.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center p-6">
        <h1 className="mb-4 text-2xl font-bold text-gray-800">
          Pedido #{order.id.slice(0, 8).toUpperCase()}
        </h1>
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <p className="text-lg font-medium">{statusText[order.status]}</p>
            {order.delivered_at && (
              <p className="mt-1 text-sm text-gray-500">
                Entregado{' '}
                <time dateTime={order.delivered_at}>
                  {new Date(order.delivered_at).toLocaleString('es-MX', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </p>
            )}
          </div>

          <div className="border rounded-lg p-4">
            <div className="flex justify-between mb-2">
              <span className="font-medium">Total</span>
              <span className="font-mono">{formatMXN(order.total)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-500">
              <span>ETA estimado</span>
              <span>{etaFormatted}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-500">
              <span>Fecha de pedido</span>
              <span>
                {new Date(order.created_at).toLocaleDateString('es-MX', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}
              </span>
            </div>
          </div>

          <div className="mt-6 text-center text-sm text-gray-500">
            Este enlace es solo para seguimiento. No se puede modificar el pedido desde aquí.
          </div>
        </div>
      </div>
    );
  }

  // modo repartidor
  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center p-6">
      <h1 className="mb-4 text-2xl font-bold text-gray-800">
        Confirmar entrega
      </h1>
      {completed ? (
        <p className="mt-4 text-gray-500">
          Pedido #{token.slice(0, 8).toUpperCase()} marcado como entregado.
        </p>
      ) : error ? (
        <p className="mt-4 text-red-600">{error}</p>
      ) : (
        <>
          <p className="mt-4">
            Presiona el botón para marcar el pedido como entregado.
          </p>
          <button
            onClick={handleComplete}
            disabled={delivering}
            className={`w-full mt-4 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 transition disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {delivering ? 'Marcando...' : 'Marcar como entregado'}
          </button>
        </>
      )}
    </div>
  );
}