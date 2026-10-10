// src/features/staff/useRealtimeOrders.ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { listOrdersForLocation } from '@/lib/server/order';
import { REALTIME_SUBSCRIBE_STATES, type RealtimeChannel, type RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Order } from '@/lib/types';

/**
 * Hook de Realtime para órdenes del local (para KDS y Caja).
 *
 * - Carga inicial y refetch: server action `listOrdersForLocation` (service
 *   role en el servidor con filtro explícito por location_id). A diferencia
 *   del SELECT browser a `staff_orders_view`, no depende del GUC
 *   `app.local_id` (nunca seteado en el browser) ni del claim
 *   user_metadata.location_id del JWT: el pedido nuevo aparece siempre.
 * - Suscripción: postgres_changes a la tabla `orders` filtrando por
 *   location_id, como mejora "en vivo". Requiere Realtime habilitado en
 *   `orders` y la policy orders_staff_live (docs/fix-realtime-caja.sql).
 * - Red de seguridad: refetch al conectar el canal, al recuperar el foco de
 *   la pestaña y por polling cada REFRESH_INTERVAL_MS. Así el pedido aparece
 *   aunque Realtime esté sin configurar o se pierda un evento.
 *
 * Uso:
 *   const orders = useRealtimeOrders({ locationId, statuses, limit });
 */

const REFRESH_INTERVAL_MS = 30_000;

export interface UseRealtimeOrdersResult extends Array<Order> {
  orders?: Order[];
  mutateOrderStatusOptimistic?: (orderId: string, nextStatus: Order['status']) => () => void;
  refresh?: () => Promise<void>;
}

export function useRealtimeOrders(opts: {
  locationId: string;
  statuses?: Order['status'][];
  limit?: number;
  enabled?: boolean;
  includePendingTableOrders?: boolean;
}): Order[] & {
  mutateOrderStatusOptimistic: (orderId: string, nextStatus: Order['status']) => () => void;
  refresh: () => Promise<void>;
} {
  const { locationId, statuses, limit = 100, enabled = true, includePendingTableOrders = false } = opts;
  // Los callers pasan literales; key estable para las dependencias del efecto.
  const statusesKey = statuses?.join(',') ?? '';
  const [orders, setOrders] = useState<Order[]>([]);
  const supabase = useRef<ReturnType<typeof createClient> | null>(null);

  /**
   * Actualiza el estado de una orden optimísticamente en memoria sin esperar al servidor.
   * Devuelve una función para revertir el cambio si la llamada remota falla.
   */
  const mutateOrderStatusOptimistic = useCallback(
    (orderId: string, nextStatus: Order['status']) => {
      let previousOrder: Order | undefined;

      setOrders((prev) => {
        const target = prev.find((o) => o.id === orderId);
        if (!target) return prev;
        previousOrder = { ...target };

        return prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                status: nextStatus,
                updated_at: new Date().toISOString(),
              }
            : o
        );
      });

      // Retorna función de rollback
      return () => {
        if (!previousOrder) return;
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? (previousOrder as Order) : o))
        );
      };
    },
    []
  );

  // Carga/refetch desde el servidor. Concilia con el estado actual para que
  // un refetch en vuelo no reviva estados viejos ni tape un pedido recién
  // insertado que llegó por Realtime mientras el fetch estaba en curso.
  const refresh = useCallback(async () => {
    if (!locationId) return;
    const filterStatuses = statusesKey
      ? (statusesKey.split(',') as Order['status'][])
      : undefined;
    try {
      const fetched = await listOrdersForLocation({
        statuses: filterStatuses,
        limit,
        includePendingTableOrders,
      });
      setOrders((prev) => {
        const byId = new Map<string, Order>();
        for (const o of fetched) byId.set(o.id, o);

        const freshCutoff = Date.now() - REFRESH_INTERVAL_MS;
        for (const o of prev) {
          const serverRow = byId.get(o.id);
          if (!serverRow) {
            // Ausente del snapshot del servidor: conservarla solo si es una
            // fila recién insertada (llegó por Realtime durante el fetch) y
            // sigue dentro del filtro de estados; el próximo refetch la trae.
            const isFresh = new Date(o.created_at).getTime() >= freshCutoff;
            const isPendingTable = includePendingTableOrders && o.order_type === 'EN_MESA' && o.payment_status === 'PENDIENTE';
            const isActive = !filterStatuses || filterStatuses.includes(o.status) || isPendingTable;
            if (isFresh && isActive) byId.set(o.id, o);
            continue;
          }
          // El snapshot trae la fila: prevalece la versión más reciente
          // (updated_at) para no deshacer un UPDATE de Realtime en vuelo.
          if ((serverRow.updated_at ?? '') < (o.updated_at ?? '')) {
            byId.set(o.id, o);
          }
        }

        return [...byId.values()]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, limit);
      });
    } catch (err) {
      // Antes los errores de carga se tragaban en silencio y Caja/KDS quedaban
      // vacías sin explicación (síntoma: "el pedido no aparece").
      console.error('useRealtimeOrders/refresh:', err);
    }
  }, [locationId, statusesKey, limit]);

  useEffect(() => {
    if (!enabled || !locationId) return;

    if (!supabase.current) {
      supabase.current = createClient();
    }

    let cancelled = false;
    const refreshOnce = () => {
      if (!cancelled) void refresh();
    };

    // 1) Carga inicial desde el servidor.
    refreshOnce();

    // 2) Polling periódico (red de seguridad si Realtime no entrega eventos).
    const intervalId = window.setInterval(refreshOnce, REFRESH_INTERVAL_MS);

    // 3) Al recuperar el foco de la pestaña (mientras duerme se pierden eventos).
    window.addEventListener('focus', refreshOnce);

    // 4) Realtime: eventos INSERT/UPDATE/DELETE de orders del local.
    //    Setup async: supabase-js reutiliza el canal si el topic sigue
    //    registrado y removeChannel es async. En dev, StrictMode corre
    //    effect → cleanup → effect en el mismo tick: sin esta limpieza el
    //    .channel(topic) devolvería el canal viejo ya suscrito y el .on()
    //    lanzaría "cannot add postgres_changes callbacks ... after subscribe()".
    const realtimeStatuses = statusesKey
      ? (statusesKey.split(',') as Order['status'][])
      : undefined;
    let realtimeChannel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null;

    async function setupChannel() {
      const client = supabase.current!;
      const topic = `orders-realtime-${locationId}`;
      const stale = client
        .getChannels()
        .find((c: RealtimeChannel) => c.topic === `realtime:${topic}`);
      if (stale) {
        await client.removeChannel(stale);
        if (cancelled) return;
      }

      const ch = client
        .channel(topic)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `location_id=eq.${locationId}`,
          },
          (payload: RealtimePostgresChangesPayload<{ [key: string]: never }>) => {
            setOrders((prev) => {
              const incoming = payload.new as Partial<Order> | undefined;
              // El payload del Realtime incluye TODO el row de orders (columnas
              // reales). Lo normalizamos para la UI.
              const normalizedIncoming = incoming
                ? ({
                    ...incoming,
                    delivery_address: incoming.delivery_address ?? null,
                    delivery_references: incoming.delivery_references ?? null,
                    customer_phone: incoming.customer_phone ?? '',
                  } as Order)
                : undefined;
              const oldId = (payload.old as { id?: string } | undefined)?.id;

              if (payload.eventType === 'INSERT' && normalizedIncoming) {
                return [normalizedIncoming, ...prev].slice(0, limit);
              }

              if (payload.eventType === 'UPDATE' && normalizedIncoming) {
                const exists = prev.some((o) => o.id === normalizedIncoming.id);
                if (!exists) {
                  const isPendingTable = includePendingTableOrders && normalizedIncoming.order_type === 'EN_MESA' && normalizedIncoming.payment_status === 'PENDIENTE';
                  if (
                    realtimeStatuses?.length &&
                    !realtimeStatuses.includes(normalizedIncoming.status) &&
                    !isPendingTable
                  ) {
                    return prev;
                  }
                  return [normalizedIncoming, ...prev].slice(0, limit);
                }
                return prev.map((o) =>
                  o.id === normalizedIncoming.id
                    ? { ...o, ...normalizedIncoming }
                    : o
                );
              }

              if (payload.eventType === 'DELETE') {
                return prev.filter((o) => o.id !== oldId);
              }

              return prev;
            });
          }
        )
        .subscribe((status: REALTIME_SUBSCRIBE_STATES) => {
          if (cancelled) return;
          // Al (re)conectar el canal sincronizamos con el servidor: cubre los
          // eventos perdidos mientras el canal estuvo desconectado o sin
          // configurar (publication/policy en Supabase).
          if (
            status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED ||
            status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT ||
            status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR
          ) {
            refreshOnce();
          }
        });

      if (cancelled) {
        // Desmontado durante el setup: no dejar el canal huérfano.
        void client.removeChannel(ch);
        return;
      }
      realtimeChannel = ch;
    }

    void setupChannel().catch((err) => {
      console.error('useRealtimeOrders/setupChannel:', err);
    });

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshOnce);
      if (realtimeChannel) {
        void supabase.current!.removeChannel(realtimeChannel);
        realtimeChannel = null;
      }
    };
  }, [locationId, statusesKey, limit, enabled, refresh]);

  // Retornar el array extendido con los helpers para evitar breaking changes
  return Object.assign(orders, {
    mutateOrderStatusOptimistic,
    refresh,
  });
}