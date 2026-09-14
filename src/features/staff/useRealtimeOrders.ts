// src/features/staff/useRealtimeOrders.ts
'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Order } from '@/lib/types';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

/**
 * Hook de Realtime para órdenes del local.
 * Escucha cambios (INSERT/UPDATE/DELETE) en la tabla `orders`
 * filtrando por location_id y mantiene la lista local sincronizada.
 *
 * Uso:
 *   const orders = useRealtimeOrders({ locationId, statuses, limit });
 *
 * Nota: requiere que Supabase Realtime esté habilitado para la tabla `orders`
 * (Dashboard → Database → Replication) y que el anon key tenga permisos
 * de suscripción a postgres_changes (o usar un canal con filtro).
 */
export function useRealtimeOrders(opts: {
  locationId: string;
  statuses?: Order['status'][];
  limit?: number;
  enabled?: boolean;
}): Order[] {
  const { locationId, statuses, limit = 100, enabled = true } = opts;
  const [orders, setOrders] = useState<Order[]>([]);
  const supabase = useRef<ReturnType<typeof createClient> | null>(null);

  useEffect(() => {
    if (!enabled || !locationId) return;

    if (!supabase.current) {
      supabase.current = createClient();
    }

    // Cargar estado inicial
    let isMounted = true;
    async function loadInitial() {
      let query = supabase
        .current!.from('orders')
        .select('*')
        .eq('location_id', locationId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (statuses?.length) {
        query = query.in('status', statuses);
      }
      const { data, error } = await query;
      if (isMounted && !error) {
        setOrders((data ?? []) as Order[]);
      }
    }
    loadInitial();

    // Suscribirse a cambios
    const channel = supabase
      .current!.channel(`orders-realtime-${locationId}`)
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
            const incoming = payload.new as Order | undefined;
            const oldId = (payload.old as { id?: string } | undefined)?.id;

            if (payload.eventType === 'INSERT' && incoming) {
              // Insert nuevo: agregar al frente (más reciente)
              return [incoming, ...prev].slice(0, limit);
            }

            if (payload.eventType === 'UPDATE' && incoming) {
              const exists = prev.some((o) => o.id === incoming.id);
              if (!exists) {
                // Si el update trae una orden que no teníamos (p.ej. cambió de estado),
                // agregarla respetando el filtro de statuses.
                if (statuses?.length && !statuses.includes(incoming.status)) {
                  return prev;
                }
                return [incoming, ...prev].slice(0, limit);
              }
              return prev.map((o) =>
                o.id === incoming.id
                  ? { ...o, ...incoming }
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
      .subscribe();

    return () => {
      isMounted = false;
      supabase.current!.removeChannel(channel);
    };
  }, [locationId, statuses?.join(','), limit, enabled]);

  return orders;
}