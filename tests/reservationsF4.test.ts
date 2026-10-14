import { describe, it, expect } from 'vitest';
import {
  getSlotStatus,
  findClosestAvailableSlot,
  calculateZoneOccupancy,
  timeToMinutes,
} from '../src/lib/reservations-utils';
import type { SlotAvailability, ZoneAvailabilityInfo, RestaurantTable } from '../src/lib/types';
import fs from 'node:fs';
import path from 'node:path';

describe('FEATURE 4: Reservaciones Progresivas y Gestión de Aforo por Zona', () => {
  describe('CA-4.1: Helper de estados de slots y sugerencias preventivas ±30 min', () => {
    it('determina correctamente el estado del slot: FULL, LAST_SPOTS, AVAILABLE', () => {
      // 1. Sin disponibilidad o canBook=false -> FULL
      expect(getSlotStatus(null)).toBe('FULL');
      expect(
        getSlotStatus({
          zone: 'INTERIOR',
          capacity: 20,
          reserved: 20,
          available: 0,
          canBook: false,
        })
      ).toBe('FULL');

      // 2. Disponible pero con 4 o menos comensales libres -> LAST_SPOTS
      expect(
        getSlotStatus({
          zone: 'INTERIOR',
          capacity: 20,
          reserved: 18,
          available: 2,
          canBook: true,
        })
      ).toBe('LAST_SPOTS');

      // 3. Disponible con 1 sola mesa física -> LAST_SPOTS
      expect(
        getSlotStatus({
          zone: 'INTERIOR',
          capacity: 20,
          reserved: 10,
          available: 10,
          canBook: true,
          availableTables: [{ id: 't1' } as RestaurantTable],
        })
      ).toBe('LAST_SPOTS');

      // 4. Disponible con aforo holgado -> AVAILABLE
      expect(
        getSlotStatus({
          zone: 'INTERIOR',
          capacity: 30,
          reserved: 10,
          available: 20,
          canBook: true,
          availableTables: [{ id: 't1' } as RestaurantTable, { id: 't2' } as RestaurantTable],
        })
      ).toBe('AVAILABLE');
    });

    it('findClosestAvailableSlot sugiere la alternativa más cercana dentro de ±30 min', () => {
      const slots: SlotAvailability[] = [
        {
          time: '19:00',
          zones: {
            INTERIOR: { zone: 'INTERIOR', capacity: 20, reserved: 0, available: 20, canBook: true },
            TERRAZA: { zone: 'TERRAZA', capacity: 10, reserved: 0, available: 10, canBook: true },
            BARRA: { zone: 'BARRA', capacity: 5, reserved: 0, available: 5, canBook: true },
          },
          isAvailable: true,
        },
        {
          time: '19:30',
          zones: {
            INTERIOR: { zone: 'INTERIOR', capacity: 20, reserved: 20, available: 0, canBook: false },
            TERRAZA: { zone: 'TERRAZA', capacity: 10, reserved: 10, available: 0, canBook: false },
            BARRA: { zone: 'BARRA', capacity: 5, reserved: 5, available: 0, canBook: false },
          },
          isAvailable: false,
        },
        {
          time: '20:00',
          zones: {
            INTERIOR: { zone: 'INTERIOR', capacity: 20, reserved: 20, available: 0, canBook: false },
            TERRAZA: { zone: 'TERRAZA', capacity: 10, reserved: 0, available: 10, canBook: true },
            BARRA: { zone: 'BARRA', capacity: 5, reserved: 5, available: 0, canBook: false },
          },
          isAvailable: true,
        },
        {
          time: '20:30',
          zones: {
            INTERIOR: { zone: 'INTERIOR', capacity: 20, reserved: 0, available: 20, canBook: true },
            TERRAZA: { zone: 'TERRAZA', capacity: 10, reserved: 0, available: 10, canBook: true },
            BARRA: { zone: 'BARRA', capacity: 5, reserved: 0, available: 5, canBook: true },
          },
          isAvailable: true,
        },
      ];

      // Para INTERIOR: 20:00 está lleno, 19:30 está lleno, pero 20:30 está disponible (+30 min)
      const suggestion = findClosestAvailableSlot(slots, '20:00', 'INTERIOR', 30);
      expect(suggestion).toBe('20:30');

      // Si no hay alternativas en ±30 min (ej. con ventana de 15 min), retorna null
      const noAlternative = findClosestAvailableSlot(slots, '20:00', 'INTERIOR', 15);
      expect(noAlternative).toBeNull();
    });

    it('convierte horas a minutos con timeToMinutes', () => {
      expect(timeToMinutes('14:30')).toBe(870);
      expect(timeToMinutes('00:00')).toBe(0);
      expect(timeToMinutes('23:59')).toBe(1439);
    });
  });

  describe('CA-4.2: Gestión de aforo por zona y detección de sobreaforo', () => {
    it('calculateZoneOccupancy totaliza comensales activos y detecta isOverCapacity', () => {
      const capacities = {
        INTERIOR: 20,
        TERRAZA: 10,
        BARRA: 6,
      };

      const reservations = [
        { preferred_zone: 'INTERIOR' as const, party_size: 4, status: 'CONFIRMADA' },
        { preferred_zone: 'INTERIOR' as const, party_size: 6, status: 'PENDIENTE' },
        { preferred_zone: 'INTERIOR' as const, party_size: 12, status: 'CONFIRMADA' }, // Suma 22 (> 20) -> over
        { preferred_zone: 'TERRAZA' as const, party_size: 5, status: 'CONFIRMADA' }, // Suma 5 (<= 10)
        { preferred_zone: 'TERRAZA' as const, party_size: 8, status: 'CANCELADA' }, // Ignorada
        { preferred_zone: 'BARRA' as const, party_size: 2, status: 'CONFIRMADA' },
      ];

      const occupancy = calculateZoneOccupancy(reservations, capacities);

      expect(occupancy.INTERIOR.reserved).toBe(22);
      expect(occupancy.INTERIOR.isOverCapacity).toBe(true);
      expect(occupancy.INTERIOR.percent).toBe(100);

      expect(occupancy.TERRAZA.reserved).toBe(5);
      expect(occupancy.TERRAZA.isOverCapacity).toBe(false);
      expect(occupancy.TERRAZA.percent).toBe(50);

      expect(occupancy.BARRA.reserved).toBe(2);
      expect(occupancy.BARRA.isOverCapacity).toBe(false);
      expect(occupancy.BARRA.percent).toBe(33);
    });
  });

  describe('Integración UI en ReservationClient y DailyReservationsList', () => {
    it('ReservationClient incorpora flujo en 3 pasos con aria-pressed y soporte de alternativas', () => {
      const clientPath = path.resolve(
        __dirname,
        '../src/app/[location]/reservar/ReservationClient.tsx'
      );
      const content = fs.readFileSync(clientPath, 'utf8');

      expect(content).toContain('currentStep');
      expect(content).toContain('goToStep');
      expect(content).toContain('aria-pressed');
      expect(content).toContain('findClosestAvailableSlot');
      expect(content).toContain('getSlotStatus');
      expect(content).toContain('Progreso de la reservación');
    });

    it('DailyReservationsList renderiza barras de aforo y alerta preventiva ante sobrecupo', () => {
      const adminListPath = path.resolve(
        __dirname,
        '../src/features/admin/DailyReservationsList.tsx'
      );
      const content = fs.readFileSync(adminListPath, 'utf8');

      expect(content).toContain('calculateZoneOccupancy');
      expect(content).toContain('overCapacityZones');
      expect(content).toContain('⚠️ Alerta: El aforo de');
    });
  });
});
