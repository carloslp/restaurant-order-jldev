'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

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
  // loaded=true solo cuando ya recibimos la respuesta inicial de la DB.
  // Importante: la policy pública products_public_read solo deja leer
  // is_available=true, así que un producto agotado puede no venir en la
  // respuesta; tratar "sin dato pero ya cargado" como NO disponible
  // evita mostrar como disponible algo agotado.
  const [loaded, setLoaded] = useState(false);
  const supabase = useRef<ReturnType<typeof createClient> | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);

  // Cargar estado inicial
  const loadInitialAvailability = useCallback(async () => {
    if (!enabled || !locationId || !productIds.length) {
      setLoaded(true);
      return;
    }

    if (!supabase.current) {
      supabase.current = createClient();
    }

    try {
      const { data, error } = await supabase.current
        .from('products')
        .select('id, is_available')
        .eq('location_id', locationId)
        .in('id', productIds);

      if (!error && data) {
        const initialState: ProductAvailabilityState = {};
        for (const product of data as ProductAvailabilityRow[]) {
          initialState[product.id] = product.is_available;
        }
        // Productos pedidos pero ausentes en la respuesta (RLS los oculta
        // por is_available=false) se marcan explícitamente no disponibles.
        for (const id of productIds) {
          if (!(id in initialState)) initialState[id] = false;
        }
        setAvailability(initialState);
      }
    } catch (error) {
      console.error('Error loading initial product availability:', error);
    } finally {
      setLoaded(true);
    }
  }, [enabled, locationId, productIds]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      if (!enabled || !locationId) {
        if (mounted) setLoaded(true);
        return;
      }

      await loadInitialAvailability();

      if (!supabase.current) {
        supabase.current = createClient();
      }

      // Suscribirse a cambios de disponibilidad
      const channel = supabase.current
        .channel(`products-availability-${locationId}`)
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
            const newProduct = payload.new as ProductAvailabilityRow;
            const oldProduct = payload.old as ProductAvailabilityRow;

            // Solo reaccionar si cambió is_available y es un producto que nos interesa
            if (
              newProduct.is_available !== oldProduct.is_available &&
              productIds.includes(newProduct.id)
            ) {
              setAvailability((prev) => ({
                ...prev,
                [newProduct.id]: newProduct.is_available,
              }));
            }
          }
        )
        .subscribe();

      channelRef.current = channel;
    }

    init();

    return () => {
      mounted = false;
      if (channelRef.current) {
        supabase.current?.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [enabled, locationId, productIds.join(','), loadInitialAvailability]);

  // Función para verificar disponibilidad actual (útil antes de confirmar pedido)
  // Sin dato y aún sin cargar → true (no bloquear el menú en el primer render).
  // Sin dato pero ya cargado → false (RLS oculta los agotados al anónimo).
  const checkAvailability = useCallback(
    (productId: string): boolean => {
      if (productId in availability) return availability[productId];
      return !loaded;
    },
    [availability, loaded]
  );

  // Verificar si todos los productos de un array están disponibles
  const areAllAvailable = useCallback(
    (ids: string[]): boolean => {
      return ids.every((id) => (id in availability ? availability[id] : !loaded));
    },
    [availability, loaded]
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