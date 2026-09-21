// src/app/track/[token]/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { formatMXN } from '@/lib/pricing';
import { getOrderByDeliveryToken, markOrderAsDeliveredByToken } from '@/lib/server/order';
import Link from 'next/link';
import { 
  CheckCircle2, 
  UtensilsCrossed, 
  Bike, 
  PackageCheck, 
  Clock, 
  AlertCircle, 
  Loader2, 
  Store,
  ChevronRight,
  ShieldCheck,
  Calendar
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
  order_type: 'RECOGER' | 'DOMICILIO';
  customer_name: string;
  delivery_address: string | null;
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

  const fetchClientOrder = useCallback(async (deliveryToken: string, isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      const orderData = await getOrderByDeliveryToken(deliveryToken);
      if (!orderData) {
        if (isInitial) setError('Orden no encontrada o token inválido');
        return null;
      }
      const mapped: TrackedOrder = {
        id: orderData.id,
        status: orderData.status as OrderStatus,
        order_type: orderData.order_type,
        customer_name: orderData.customer_name,
        delivery_address: orderData.delivery_address,
        eta: orderData.eta,
        total: orderData.total,
        created_at: orderData.created_at,
        delivered_at: orderData.delivered_at ?? null,
      };
      setOrder(mapped);
      return mapped;
    } catch (err) {
      console.error(err);
      if (isInitial) setError('Error al obtener la orden');
      return null;
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setError('Token no proporcionado');
      setMode('unknown');
      setLoading(false);
      return;
    }

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
    if (!isUUID) {
      setMode('repartidor');
      setLoading(false);
      return;
    }

    setMode('client');
    let isCancelled = false;
    let timerId: ReturnType<typeof setInterval> | null = null;

    async function load() {
      const current = await fetchClientOrder(token, true);
      if (isCancelled || !current) return;

      // Si ya está terminado o cancelado, no programar polling
      if (['COMPLETADO', 'CANCELADO'].includes(current.status)) {
        return;
      }

      // Polling inteligente cada 5 segundos mientras esté activo
      timerId = setInterval(async () => {
        if (isCancelled) return;
        const updated = await fetchClientOrder(token, false);
        if (updated && ['COMPLETADO', 'CANCELADO'].includes(updated.status)) {
          if (timerId) clearInterval(timerId);
        }
      }, 5000);
    }

    load();

    const onFocus = () => {
      if (!isCancelled) {
        fetchClientOrder(token, false);
      }
    };
    window.addEventListener('focus', onFocus);

    return () => {
      isCancelled = true;
      if (timerId) clearInterval(timerId);
      window.removeEventListener('focus', onFocus);
    };
  }, [token, fetchClientOrder]);

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
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="w-8 h-8 text-orange-600 animate-spin mb-3" />
        <p className="text-sm font-semibold text-zinc-600">Buscando información de tu pedido...</p>
      </div>
    );
  }

  if (mode === 'unknown') {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-zinc-200 shadow-xl text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-zinc-900 mb-2">Seguimiento de Pedido</h1>
          <p className="text-sm text-zinc-500 mb-4">
            {error ? error : 'El enlace de seguimiento no es válido o ha caducado.'}
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-orange-700 active:scale-95 transition-all"
          >
            <Store className="w-4 h-4" />
            Volver a inicio
          </Link>
        </div>
      </div>
    );
  }

  if (mode === 'client') {
    if (!order) {
      return (
        <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6">
          <Loader2 className="w-8 h-8 text-orange-600 animate-spin mb-3" />
          <p className="text-sm text-zinc-500">Cargando datos...</p>
        </div>
      );
    }

    const etaDate = new Date(order.eta);
    const etaFormatted = isNaN(etaDate.getTime())
      ? 'Aproximadamente 30 min'
      : etaDate.toLocaleTimeString('es-MX', {
          hour: '2-digit',
          minute: '2-digit',
        });

    // Pasos del stepper según tipo de servicio
    const isDelivery = order.order_type === 'DOMICILIO';

    const steps = isDelivery
      ? [
          {
            id: 'recibido',
            label: 'Pedido recibido',
            desc: 'Comanda registrada y confirmada en caja',
            icon: CheckCircle2,
            active: ['CREADO', 'CONFIRMADO_CAJA', 'EN_PREPARACION', 'LISTO', 'LISTO_PARA_ENTREGA', 'COMPLETADO'].includes(order.status),
            current: ['CREADO', 'CONFIRMADO_CAJA'].includes(order.status),
          },
          {
            id: 'cocina',
            label: 'En cocina',
            desc: 'Cocinando tus platillos en cocina',
            icon: UtensilsCrossed,
            active: ['EN_PREPARACION', 'LISTO', 'LISTO_PARA_ENTREGA', 'COMPLETADO'].includes(order.status),
            current: order.status === 'EN_PREPARACION',
          },
          {
            id: 'listo',
            label: 'Listo (en espera de entrega)',
            desc: 'Empacado y listo, esperando al repartidor',
            icon: PackageCheck,
            active: ['LISTO', 'LISTO_PARA_ENTREGA', 'COMPLETADO'].includes(order.status),
            current: order.status === 'LISTO',
          },
          {
            id: 'en_camino',
            label: 'En camino',
            desc: 'El repartidor lleva tu comanda hacia tu domicilio',
            icon: Bike,
            active: ['LISTO_PARA_ENTREGA', 'COMPLETADO'].includes(order.status),
            current: order.status === 'LISTO_PARA_ENTREGA',
          },
          {
            id: 'completado',
            label: 'Entregado',
            desc: 'Pedido entregado en tu dirección. ¡Buen provecho!',
            icon: CheckCircle2,
            active: order.status === 'COMPLETADO',
            current: order.status === 'COMPLETADO',
          },
        ]
      : [
          {
            id: 'recibido',
            label: 'Pedido recibido',
            desc: 'Comanda registrada y confirmada en caja',
            icon: CheckCircle2,
            active: ['CREADO', 'CONFIRMADO_CAJA', 'EN_PREPARACION', 'LISTO', 'COMPLETADO'].includes(order.status),
            current: ['CREADO', 'CONFIRMADO_CAJA'].includes(order.status),
          },
          {
            id: 'cocina',
            label: 'En cocina',
            desc: 'Cocinando tus platillos en cocina',
            icon: UtensilsCrossed,
            active: ['EN_PREPARACION', 'LISTO', 'COMPLETADO'].includes(order.status),
            current: order.status === 'EN_PREPARACION',
          },
          {
            id: 'listo',
            label: 'Listo (en espera de ser recogido)',
            desc: 'Tu orden está lista en mostrador para que pases por ella',
            icon: Store,
            active: ['LISTO', 'COMPLETADO'].includes(order.status),
            current: order.status === 'LISTO',
          },
          {
            id: 'completado',
            label: 'Entregado',
            desc: 'Pedido retirado en el local. ¡Buen provecho!',
            icon: PackageCheck,
            active: order.status === 'COMPLETADO',
            current: order.status === 'COMPLETADO',
          },
        ];

    const isCancelled = order.status === 'CANCELADO';

    return (
      <div className="min-h-screen bg-[#FBFBFB] py-8 sm:py-12 px-4 sm:px-6">
        <div className="max-w-xl mx-auto space-y-6">
          {/* Header de la orden */}
          <div className="text-center">
            <span className="inline-block px-3 py-1 rounded-full bg-orange-100 text-orange-800 text-xs font-bold tracking-wider uppercase mb-2">
              Seguimiento en Vivo
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900">
              Pedido #{order.id.slice(0, 8).toUpperCase()}
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 mt-1">
              Actualización en tiempo real del estado de tu orden
            </p>
          </div>

          {/* Tarjeta de ETA o Cancelación */}
          {isCancelled ? (
            <div className="bg-red-50 border border-red-200 rounded-3xl p-6 text-center text-red-800 shadow-xs">
              <AlertCircle className="w-10 h-10 text-red-600 mx-auto mb-2" />
              <h2 className="text-lg font-bold text-red-900">Pedido cancelado</h2>
              <p className="text-xs text-red-700 mt-1 max-w-sm mx-auto">
                Este pedido ha sido cancelado por el restaurante o por solicitud del cliente.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-zinc-200/80 p-5 sm:p-6 shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    {order.status === 'COMPLETADO' ? 'Hora de entrega' : 'Hora estimada (ETA)'}
                  </p>
                  <p className="text-xl sm:text-2xl font-black text-zinc-900 mt-0.5">
                    {etaFormatted}
                  </p>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                order.status === 'COMPLETADO'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                  : 'bg-orange-50 text-orange-700 border-orange-200/60'
              }`}>
                {order.status === 'COMPLETADO' ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Finalizado
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-orange-500 animate-ping" />
                    En curso
                  </>
                )}
              </span>
            </div>
          )}

          {/* Stepper Visual de etapas */}
          {!isCancelled && (
            <div className="bg-white rounded-3xl border border-zinc-200/80 p-6 sm:p-7 shadow-xs">
              <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider mb-6">
                Progreso del pedido
              </h2>

              <div className="relative pl-6 space-y-8 before:absolute before:left-9 before:top-3 before:bottom-3 before:w-0.5 before:bg-zinc-200">
                {steps.map((step) => {
                  const Icon = step.icon;
                  return (
                    <div key={step.id} className="relative flex items-start gap-4">
                      {/* Círculo indicador */}
                      <div
                        className={`absolute -left-6 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all z-10 ${
                          step.current
                            ? 'bg-orange-600 text-white ring-4 ring-orange-100 shadow-md shadow-orange-600/30'
                            : step.active
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-zinc-200 text-zinc-400'
                        }`}
                      >
                        {step.active && !step.current ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <Icon className="w-3.5 h-3.5" />
                        )}
                      </div>

                      {/* Texto descriptivo */}
                      <div className="pl-4">
                        <div className="flex items-center gap-2">
                          <h3
                            className={`text-sm font-bold ${
                              step.current
                                ? 'text-orange-600'
                                : step.active
                                  ? 'text-zinc-900'
                                  : 'text-zinc-400'
                            }`}
                          >
                            {step.label}
                          </h3>
                          {step.current && (
                            <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded uppercase tracking-wider">
                              Actual
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">{step.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Resumen del ticket */}
          <div className="bg-white rounded-3xl border border-zinc-200/80 p-5 sm:p-6 shadow-xs space-y-3 text-xs sm:text-sm">
            <h3 className="font-bold text-zinc-900 text-sm pb-2 border-b border-zinc-100">
              Detalles de la compra
            </h3>
            <div className="flex justify-between text-zinc-600">
              <span className="text-zinc-400">Modalidad</span>
              <span className="font-semibold text-zinc-800">
                {isDelivery ? '🛵 Entrega a Domicilio' : '🏪 Para Recoger en Local'}
              </span>
            </div>
            {isDelivery && order.delivery_address && (
              <div className="flex justify-between text-zinc-600 gap-4">
                <span className="text-zinc-400 shrink-0">Dirección</span>
                <span className="font-medium text-zinc-800 text-right">{order.delivery_address}</span>
              </div>
            )}
            <div className="flex justify-between text-zinc-600">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-zinc-400" /> Fecha del pedido
              </span>
              <span className="font-medium text-zinc-800">
                {new Date(order.created_at).toLocaleDateString('es-MX', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>

            <div className="flex justify-between items-baseline pt-2 border-t border-zinc-100">
              <span className="font-bold text-zinc-900">Total pagado</span>
              <span className="text-lg font-extrabold text-orange-600">
                {formatMXN(order.total)}
              </span>
            </div>

            <div className="flex items-center justify-end gap-1.5 text-[11px] text-zinc-400 pt-1">
              <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />
              <span>IVA incluido (16%)</span>
            </div>
          </div>

          <div className="text-center text-xs text-zinc-400 pt-2">
            Este enlace es único y permanente para el seguimiento de tu orden.
          </div>
        </div>
      </div>
    );
  }

  // Modo repartidor
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 sm:p-6">
      <div className="max-w-md w-full bg-white rounded-3xl border border-zinc-200/80 p-6 sm:p-8 shadow-xl text-center">
        <div className="w-16 h-16 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center mx-auto mb-4">
          <Bike className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-extrabold text-zinc-900 mb-2">
          Entrega de Pedido
        </h1>
        <p className="text-xs font-mono bg-zinc-100 text-zinc-600 px-3 py-1 rounded-full inline-block mb-4">
          Token: #{token.slice(0, 8).toUpperCase()}
        </p>

        {completed ? (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-4 text-sm font-medium">
            <CheckCircle2 className="w-6 h-6 mx-auto mb-1 text-emerald-600" />
            ¡El pedido se ha marcado como entregado exitosamente!
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-xs font-medium mb-4">
            {error}
          </div>
        ) : (
          <div>
            <p className="text-sm text-zinc-500 mb-6">
              Presiona el botón una vez que hayas entregado los alimentos al cliente.
            </p>
            <button
              onClick={handleComplete}
              disabled={delivering}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-orange-600/25 hover:bg-orange-700 active:scale-95 disabled:opacity-50 transition-all select-none"
            >
              {delivering ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Actualizando estado...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Marcar como Entregado</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}