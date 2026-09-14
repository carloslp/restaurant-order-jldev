// src/features/staff/useRealtimeOrders.ts
'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Order } from '@/lib/types';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

/**
 * Hook de Realtime para órdenes del local.
 * Requiere que la tabla `orders` tenga Realtime habilitado y que el anon key
 * pueda leer las órdenes del local (mediante RLS que use el claim `app.local_id`
 * del JWT). Para que el anon pueda leer, necesitamos que el usuario tenga una
 * sesión válida (después del magic link) y que el cliente de anon use las
 * cookies de sesión (lo hace automáticamente @supabase/ssr).
 *
 * Uso:
 *   const orders = useRealtimeOrders({ locationId, statuses, limit });
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

    // Suscribirse a cambios con filtro en la base (usa el mismo location_id)
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
                // Si el update trae una orden que no teníamos (p.ej. cambió de estado)
                // pero pasa el filtro de location_id (ya lo tiene el channel) y
                // opcionalmente de statuses, la agregamos.
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