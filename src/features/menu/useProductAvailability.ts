'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getProductsAvailability } from '@/features/menu/queries';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface ProductAvailabilityState {
  [productId: string]: boolean;
}

interface UseProductAvailabilityOptions {
  locationId: string;
  productIds: string[];
  enabled?: boolean;
}

interface ProductAvailabilityRow {
  id: string;
  is_available: boolean;
}

/**
 * Hook para suscribirse a cambios de disponibilidad de productos en tiempo real.
 * Usa Realtime postgres_changes en la tabla `products` filtrando por location_id.
 * 
 * Uso:
 *   const { isAvailable, checkAvailability } = useProductAvailability({ 
 *     locationId, 
 *     productIds: cart.items.map(i => i.product_id) 
 *   });
 */
export function useProductAvailability(opts: UseProductAvailabilityOptions) {
  const { locationId, productIds, enabled = true } = opts;
  const [availability, setAvailability] = useState<ProductAvailabilityState>({});
  const [loaded, setLoaded] = useState(false);
  const supabase = useRef<ReturnType<typeof createClient> | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);

  // Los callers suelen construir productIds inline (cart.items.map(...)): su
  // identidad cambia en cada render. El effect depende del join, no del array,
  // para no re-suscribirse (y recrear el canal) en cada render.
  const productIdsKey = productIds.join(',');

  // Cargar estado inicial vía Server Action (evita falsos "Agotado" cuando RLS
  // filtra consultas directas del navegador sin headers de sucursal).
  const loadInitialAvailability = useCallback(async () => {
    const ids = productIdsKey ? productIdsKey.split(',') : [];
    if (!enabled || !locationId || ids.length === 0) {
      setLoaded(true);
      return;
    }

    try {
      const res = await getProductsAvailability(locationId, ids);
      if (res.ok) {
        setAvailability(res.availability);
      }
    } catch (error) {
      console.error('Error loading initial product availability:', error);
    } finally {
      setLoaded(true);
    }
  }, [enabled, locationId, productIdsKey]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      if (!enabled || !locationId) {
        if (mounted) setLoaded(true);
        return;
      }

      if (!supabase.current) {
        supabase.current = createClient();
      }
      const client = supabase.current;

      try {
        // Carga inicial (antes del canal: si tarda, no bloquea la UI).
        await loadInitialAvailability();

        // El cleanup pudo correr (StrictMode en dev / deps cambiadas) durante
        // el await: no tocar el canal si el effect ya se desmontó.
        if (!mounted) return;

        const topic = `products-availability-${locationId}`;
        // Remover (y esperar) cualquier canal stale con el mismo topic:
        // supabase-js REUTILIZA el canal registrado con ese topic, y llamar
        // .on() sobre un canal ya suscrito lanza "cannot add postgres_changes
        // callbacks ... after subscribe()".
        const stale = client
          .getChannels()
          .find((c: RealtimeChannel) => c.topic === `realtime:${topic}`);
        if (stale) {
          await client.removeChannel(stale);
          if (!mounted) return;
        }

        // Suscribirse a cambios de disponibilidad (canal fresco).
        const trackedIds = productIdsKey.split(',');
        const channel = client
          .channel(topic)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'products',
              filter: `location_id=eq.${locationId}`,
            },
            (payload: RealtimePostgresChangesPayload<ProductAvailabilityRow>) => {
              if (!mounted) return;
              const newProduct = payload.new as ProductAvailabilityRow | undefined;
              // Reaccionar cuando se actualiza is_available y es un producto que nos interesa
              if (
                newProduct &&
                typeof newProduct.is_available === 'boolean' &&
                (trackedIds.length === 0 || trackedIds.includes(newProduct.id))
              ) {
                setAvailability((prev) => ({
                  ...prev,
                  [newProduct.id]: newProduct.is_available,
                }));
              }
            }
          )
          .subscribe();

        if (mounted) {
          channelRef.current = channel;
        } else {
          // Desmontado justo tras el subscribe: no dejar el canal huérfano.
          void client.removeChannel(channel);
        }
      } catch (err) {
        // Antes este fallo era un "Uncaught (in promise)" que dejaba el canal
        // roto en silencio (StrictMode re-monta los effects en dev).
        console.error('useProductAvailability/init:', err);
      }
    }

    void init();

    return () => {
      mounted = false;
      const ch = channelRef.current;
      channelRef.current = null;
      if (ch) void supabase.current?.removeChannel(ch);
    };
  }, [enabled, locationId, productIdsKey, loadInitialAvailability]);

  // Función para verificar disponibilidad actual (útil antes de confirmar pedido).
  // getProductsAvailability registra explícitamente false para productos agotados o eliminados.
  const checkAvailability = useCallback(
    (productId: string): boolean => {
      return availability[productId] ?? true;
    },
    [availability]
  );

  // Verificar si todos los productos de un array están disponibles
  const areAllAvailable = useCallback(
    (ids: string[]): boolean => {
      return ids.every((id) => availability[id] ?? true);
    },
    [availability]
  );

  // Obtener lista de productos no disponibles
  const getUnavailableProducts = useCallback(
    (ids: string[]): string[] => {
      return ids.filter((id) => availability[id] === false);
    },
    [availability]
  );

  return {
    availability,
    isLoading: !loaded,
    checkAvailability,
    areAllAvailable,
    getUnavailableProducts,
    refresh: loadInitialAvailability,
  };
}