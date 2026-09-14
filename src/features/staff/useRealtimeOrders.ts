// src/features/staff/useRealtimeOrders.ts
'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Order } from '@/lib/types';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

/**
 * Hook de Realtime para órdenes del local (para KDS y Caja).
 * - Carga inicial: SELECT a la vista segura staff_orders_view (RLS con JWT/GUC).
 * - Suscripción: postgres_changes a la tabla `orders` filtrando por location_id.
 *   Requiere Realtime habilitado en la tabla orders y la policy orders_staff_live
 *   (docs/policy-realtime-staff.sql).
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

    // Cargar estado inicial desde la vista segura (no expone datos sensibles)
    let isMounted = true;
    async function loadInitial() {
      let query = supabase
        .current!.from('staff_orders_view')
        .select('*')
        .eq('location_id', locationId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (statuses?.length) {
        query = query.in('status', statuses);
      }
      const { data, error } = await query;
      if (isMounted && !error) {
        // Normalizar: la vista tiene delivery_address_short; el hook devuelve Order.
        const normalized = (data ?? []).map((v: Record<string, unknown>) => ({
          ...v,
          delivery_address: v.delivery_address_short ?? null,
          delivery_references: null,
          delivery_token: null,
          delivery_token_expires_at: null,
          delivery_token_rotated_at: null,
          customer_phone: '', // no expuesto en la vista
        } as Order));
        setOrders(normalized);
      }
    }
    loadInitial();

    // Suscribirse a cambios de la tabla orders (los eventos llegan si la policy
    // orders_staff_live permite SELECT; el payload trae las columnas reales).
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
            const incoming = payload.new as Partial<Order> | undefined;
            // El payload del Realtime incluye TODO el row de orders (columnas reales),
            // no la vista. Lo normalizamos para la UI.
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
                if (statuses?.length && !statuses.includes(normalizedIncoming.status)) {
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
      .subscribe();

    return () => {
      isMounted = false;
      supabase.current!.removeChannel(channel);
    };
  }, [locationId, statuses?.join(','), limit, enabled]);

  return orders;
}