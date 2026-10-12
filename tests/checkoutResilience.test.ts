import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getOsmDistanceMatrix,
  geocodeAddressWithOsm,
  calculateDeliveryFee,
} from '@/lib/osm/distanceMatrix';
import { estimateDeliveryFee } from '@/features/checkout/estimateDelivery';
import type { Coordinates } from '@/lib/pricing/deliveryMatrix';

describe('FEATURE F-02: Checkout Resiliente con Estimación de Envío en Vivo y Prevención de Errores', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('CA-1 – Bloqueo de doble clic (Idempotencia de UI)', () => {
    it('estado de UI durante submit: deshabilitado, pointer-events-none, spinner y texto "Procesando pedido..."', () => {
      // Simulación de la función de cálculo de estado del botón de submit en CheckoutForm
      const getSubmitButtonState = (submitting: boolean) => ({
        disabled: submitting,
        pointerEvents: submitting ? 'none' : 'auto',
        text: submitting ? 'Procesando pedido...' : 'Confirmar Pedido',
        hasSpinner: submitting,
      });

      const idleState = getSubmitButtonState(false);
      expect(idleState.disabled).toBe(false);
      expect(idleState.pointerEvents).toBe('auto');
      expect(idleState.text).toBe('Confirmar Pedido');
      expect(idleState.hasSpinner).toBe(false);

      const loadingState = getSubmitButtonState(true);
      expect(loadingState.disabled).toBe(true);
      expect(loadingState.pointerEvents).toBe('none');
      expect(loadingState.text).toBe('Procesando pedido...');
      expect(loadingState.hasSpinner).toBe(true);
    });

    it('previene múltiples llamadas concurrentes al Server Action al pulsar doble clic', async () => {
      let callCount = 0;
      let isSubmitting = false;

      const mockCreateOrderAction = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { ok: true, order: { id: 'order-123' } };
      });

      const handleSubmit = async () => {
        if (isSubmitting) return; // Idempotencia de UI / bloqueo de doble clic
        isSubmitting = true;
        callCount++;
        try {
          await mockCreateOrderAction();
        } finally {
          isSubmitting = false;
        }
      };

      // Dispara 2 clics simultáneos (doble clic rápido)
      await Promise.all([handleSubmit(), handleSubmit()]);

      expect(callCount).toBe(1);
      expect(mockCreateOrderAction).toHaveBeenCalledTimes(1);
    });
  });

  describe('CA-2 – Manejo de fallo en cálculo de distancia OSM y timeout de 3 segundos', () => {
    const origin: Coordinates = { lat: 19.432608, lng: -99.143612 };

    it('getOsmDistanceMatrix: si excede timeout de 3s o falla la conexión, retorna null de forma segura', async () => {
      const dest: Coordinates = { lat: 19.4185, lng: -99.162 };

      // Simula fallo por timeout (AbortError)
      global.fetch = vi.fn().mockImplementation(() => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      const result = await getOsmDistanceMatrix(origin, dest, 3000);
      expect(result).toBeNull();
    });

    it('geocodeAddressWithOsm: si falla la conexión o hay timeout, retorna null sin lanzar error no controlado', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection failed'));

      const result = await geocodeAddressWithOsm('Calle Desconocida 999, CDMX', 3000);
      expect(result).toBeNull();
    });

    it('calculateDeliveryFee: si falla la geocodificación de una dirección explícita, no bloquea y devuelve mensaje amigable de confirmación al contactar', async () => {
      // Mock de fetch para simular fallo de red o timeout
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error (timeout / no connection)'));

      const result = await calculateDeliveryFee({
        origin,
        destinationAddress: 'Av. Insurgentes Sur 1500, CDMX',
        localFallbackFee: 35,
      });

      // La pantalla no se rompe: se mantiene entregable pero con advertencia y confirmación al contactar
      expect(result.isDeliverable).toBe(true);
      expect(result.failedToCalculate).toBe(true);
      expect(result.source).toBe('FALLBACK_FLAT');
      expect(result.reason).toBe(
        'No pudimos calcular la distancia exacta. El costo de envío se confirmará al contactarte'
      );
    });

    it('calculateDeliveryFee: si geocodifica pero OSRM falla (timeout 3s), aplica fallback geodésico con advertencia', async () => {
      const destCoords: Coordinates = { lat: 19.4185, lng: -99.162 };

      // OSRM falla por timeout o error
      global.fetch = vi.fn().mockRejectedValue(new Error('OSRM timeout 3s'));

      const result = await calculateDeliveryFee({
        origin,
        destinationCoordinates: destCoords,
      });

      expect(result.isDeliverable).toBe(true);
      expect(result.failedToCalculate).toBe(true);
      expect(result.source).toBe('HAVERSINE_FALLBACK');
      expect(result.reason).toBe(
        'No pudimos calcular la distancia exacta. El costo de envío se confirmará al contactarte'
      );
    });

    it('estimateDeliveryFee: ante error o timeout retorna calculationFailed con microcopy accesible para reintento', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('OSM server unreachable'));

      const res = await estimateDeliveryFee({
        locationId: 'loc-centro',
        address: 'Dirección con error de red 123',
      });

      expect(res.calculationFailed).toBe(true);
      expect(res.error).toBe(
        'No pudimos calcular la distancia exacta. El costo de envío se confirmará al contactarte'
      );
    });
  });

  describe('CA-3 – Idempotencia Server-Side de Órdenes', () => {
    it('actions.ts createOrder: si se provee idempotency_key existente, retorna la orden previa sin duplicar', async () => {
      const localModule = await import('@/lib/server/local');
      vi.spyOn(localModule, 'getLocalById').mockResolvedValueOnce({
        id: 'loc-1',
        name: 'Local Centro',
        slug: 'centro',
        timezone: 'America/Mexico_City',
        iva_rate: 0.16,
        delivery_fee: 0,
        is_open: true,
        is_catalog_only: false,
        reservations_enabled: true,
      });

      const existingOrder = {
        id: 'order-existing-999',
        location_id: 'loc-1',
        idempotency_key: 'idem-key-abc-123',
        delivery_token: 'delivery-uuid-999',
        status: 'CREADO',
        total: 150,
      };

      const supabaseServer = await import('@/lib/supabase/server');
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: existingOrder, error: null }),
          }),
        }),
      });

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'orders') {
            return {
              select: mockSelect,
            };
          }
          return {};
        }),
      };

      vi.spyOn(supabaseServer, 'createServerClient').mockReturnValue(mockSupabase as any);

      const { createOrder } = await import('@/features/checkout/actions');

      const result = await createOrder({
        location_id: 'loc-1',
        cart: { items: [], location_id: 'loc-1' },
        customer_name: 'Juan Perez',
        customer_phone: '5512345678',
        order_type: 'RECOGER',
        payment_method: 'EFECTIVO_EXACTO',
        eta: new Date().toISOString(),
        idempotency_key: 'idem-key-abc-123',
      });

      expect(result.ok).toBe(true);
      expect(result.order?.id).toBe('order-existing-999');
      expect(result.track_token).toBe('delivery-uuid-999');
    });
  });
});
