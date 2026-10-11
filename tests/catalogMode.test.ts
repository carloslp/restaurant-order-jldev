import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toLocalInfo } from '@/lib/server/local';

describe('Catalog Mode & Reservations Toggles', () => {
  describe('toLocalInfo mapping & defaults', () => {
    it('mapea is_catalog_only en false y reservations_enabled en true por defecto cuando no vienen en la BD', () => {
      const rawDbData = {
        id: 'loc-1',
        name: 'Sucursal Centro',
        slug: 'centro',
        timezone: 'America/Mexico_City',
        iva_rate: 0.16,
        delivery_fee: 35,
        address: 'Av Juárez 100',
        latitude: 19.4326,
        longitude: -99.1332,
        is_open: true,
      };

      const info = toLocalInfo(rawDbData);
      expect(info.is_catalog_only).toBe(false);
      expect(info.reservations_enabled).toBe(true);
    });

    it('respeta is_catalog_only: true cuando está configurado como modo catálogo', () => {
      const rawDbData = {
        id: 'loc-2',
        name: 'Sucursal Catálogo',
        slug: 'catalogo',
        timezone: 'America/Mexico_City',
        iva_rate: 0.16,
        delivery_fee: 0,
        is_catalog_only: true,
        reservations_enabled: true,
      };

      const info = toLocalInfo(rawDbData);
      expect(info.is_catalog_only).toBe(true);
      expect(info.reservations_enabled).toBe(true);
    });

    it('respeta reservations_enabled: false cuando las reservaciones están desactivadas', () => {
      const rawDbData = {
        id: 'loc-3',
        name: 'Sucursal Express',
        slug: 'express',
        timezone: 'America/Mexico_City',
        iva_rate: 0.16,
        delivery_fee: 20,
        is_catalog_only: false,
        reservations_enabled: false,
      };

      const info = toLocalInfo(rawDbData);
      expect(info.is_catalog_only).toBe(false);
      expect(info.reservations_enabled).toBe(false);
    });

    it('soporta ambas opciones activadas simultáneamente (catálogo activo y reservas desactivadas)', () => {
      const rawDbData = {
        id: 'loc-4',
        name: 'Sucursal Solo Vitrina',
        slug: 'vitrina',
        timezone: 'America/Mexico_City',
        iva_rate: 0.16,
        delivery_fee: 0,
        is_catalog_only: true,
        reservations_enabled: false,
      };

      const info = toLocalInfo(rawDbData);
      expect(info.is_catalog_only).toBe(true);
      expect(info.reservations_enabled).toBe(false);
    });
  });

  describe('Order Creation & Reservation Protection Guards', () => {
    it('bloquea createOrder si la sucursal está en is_catalog_only', async () => {
      // Import createOrder dynamically or test its guard contract
      const localModule = await import('@/lib/server/local');
      vi.spyOn(localModule, 'getLocalById').mockResolvedValueOnce({
        id: 'loc-cat-1',
        name: 'Sucursal Menú Solo Lectura',
        slug: 'solo-lectura',
        timezone: 'America/Mexico_City',
        iva_rate: 0.16,
        delivery_fee: 0,
        is_open: true,
        is_catalog_only: true,
        reservations_enabled: true,
      });

      const { createOrder } = await import('@/features/checkout/actions');

      const fakeCart: any = {
        id: 'cart-1',
        location_id: 'loc-cat-1',
        items: [{ id: 'p1', product_id: 'prod-1', name: 'Taco', price: 20, quantity: 1 }],
        subtotal: 20,
        tax: 3.2,
        total: 23.2,
      };

      const result = await createOrder({
        location_id: 'loc-cat-1',
        cart: fakeCart,
        customer_name: 'Juan Perez',
        customer_phone: '5512345678',
        order_type: 'RECOGER',
        payment_method: 'EFECTIVO_EXACTO',
        eta: new Date(Date.now() + 3600000).toISOString(),
        idempotency_key: 'idem-test-123',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('modo solo visualización');
      expect(result.error).toContain('No se aceptan pedidos en línea');
    });

    it('bloquea getPublicAvailability si reservations_enabled es false', async () => {
      const { getPublicAvailability } = await import('@/lib/server/reservations');
      const localModule = await import('@/lib/server/local');

      vi.spyOn(localModule, 'getLocalBySlug').mockResolvedValueOnce({
        id: 'loc-no-res-1',
        name: 'Sucursal Sin Reservas',
        slug: 'sin-reservas',
        timezone: 'America/Mexico_City',
        iva_rate: 0.16,
        delivery_fee: 0,
        is_open: true,
        is_catalog_only: false,
        reservations_enabled: false,
      });

      const result = await getPublicAvailability('sin-reservas', '2026-10-15', 2);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('desactivadas temporalmente');
      expect(result.slots).toHaveLength(0);
    });

    it('bloquea createPublicReservation si reservations_enabled es false', async () => {
      const { createPublicReservation } = await import('@/lib/server/reservations');
      const localModule = await import('@/lib/server/local');

      vi.spyOn(localModule, 'getLocalBySlug').mockResolvedValueOnce({
        id: 'loc-no-res-2',
        name: 'Sucursal Sin Reservas',
        slug: 'sin-reservas-2',
        timezone: 'America/Mexico_City',
        iva_rate: 0.16,
        delivery_fee: 0,
        is_open: true,
        is_catalog_only: false,
        reservations_enabled: false,
      });

      const result = await createPublicReservation({
        location_slug: 'sin-reservas-2',
        holder_name: 'Carlos Ruiz',
        holder_phone: '5587654321',
        reservation_date: '2026-12-01',
        reservation_time: '14:00',
        party_size: 4,
        preferred_zone: 'INTERIOR',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('desactivadas temporalmente');
    });
  });
});
