import { describe, it, expect } from 'vitest';
import { isValidPhone, isValidName } from '@/lib/validation';
import type { Zone, RestaurantTable } from '@/lib/types';

// Helper de cálculo de solapamiento idéntico al del servidor
function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function isTimeOverlapping(timeA: string, timeB: string, durationMinutes = 90): boolean {
  const a = timeToMinutes(timeA);
  const b = timeToMinutes(timeB);
  return Math.abs(a - b) < durationMinutes;
}

interface MockReservation {
  table_id: string;
  reservation_time: string;
  status: string;
  party_size: number;
}

// Motor de disponibilidad basado exclusivamente en mesas físicas discretas
function getAvailableTablesForSlot({
  tables,
  reservations,
  slotTime,
  partySize,
  zone,
  durationMinutes = 90,
}: {
  tables: Array<{ id: string; table_number: string; min_capacity: number; max_capacity: number; zone: Zone; is_active: boolean }>;
  reservations: MockReservation[];
  slotTime: string;
  partySize: number;
  zone?: Zone;
  durationMinutes?: number;
}) {
  const occupiedTableIds = new Set(
    reservations
      .filter((r) => ['PENDIENTE', 'CONFIRMADA'].includes(r.status) && isTimeOverlapping(r.reservation_time, slotTime, durationMinutes))
      .map((r) => r.table_id)
  );

  return tables
    .filter((t) => {
      if (!t.is_active) return false;
      if (zone && t.zone !== zone) return false;
      if (partySize < t.min_capacity || partySize > t.max_capacity) return false;
      if (occupiedTableIds.has(t.id)) return false;
      return true;
    })
    .sort((a, b) => a.max_capacity - b.max_capacity || a.table_number.localeCompare(b.table_number));
}

describe('Reservation System - Validation & Table-Centric Engine', () => {
  describe('Phone and Name Validation', () => {
    it('validates customer name requirements', () => {
      expect(isValidName('Carlos')).toBe(true);
      expect(isValidName('Ma')).toBe(true);
      expect(isValidName(' ')).toBe(false);
      expect(isValidName('A')).toBe(false);
    });

    it('validates telephone numbers across formats', () => {
      expect(isValidPhone('5512345678')).toBe(true);
      expect(isValidPhone('+52 55 1234 5678')).toBe(true);
      expect(isValidPhone('(55) 1234-5678')).toBe(true);
      expect(isValidPhone('123')).toBe(false);
      expect(isValidPhone('invalid-phone')).toBe(false);
    });
  });

  describe('Dining Time Overlap Calculations', () => {
    it('detects overlapping slots within standard 90 minute dining window', () => {
      expect(isTimeOverlapping('14:00', '14:00')).toBe(true);
      expect(isTimeOverlapping('14:00', '14:30')).toBe(true);
      expect(isTimeOverlapping('14:00', '15:00')).toBe(true);
      expect(isTimeOverlapping('14:00', '15:29')).toBe(true);
    });

    it('identifies non-overlapping slots outside 90 minute dining window', () => {
      expect(isTimeOverlapping('14:00', '15:30')).toBe(false);
      expect(isTimeOverlapping('14:00', '16:00')).toBe(false);
      expect(isTimeOverlapping('14:00', '20:00')).toBe(false);
    });
  });

  describe('Physical Discrete Table Availability Engine', () => {
    const mockTables = [
      { id: 't-1', table_number: '1', min_capacity: 1, max_capacity: 2, zone: 'INTERIOR' as Zone, is_active: true },
      { id: 't-2', table_number: '2', min_capacity: 1, max_capacity: 2, zone: 'INTERIOR' as Zone, is_active: true },
      { id: 't-3', table_number: '3', min_capacity: 3, max_capacity: 4, zone: 'INTERIOR' as Zone, is_active: true },
      { id: 't-4', table_number: '4', min_capacity: 4, max_capacity: 8, zone: 'TERRAZA' as Zone, is_active: true },
      { id: 't-inactiva', table_number: '99', min_capacity: 1, max_capacity: 4, zone: 'INTERIOR' as Zone, is_active: false },
    ];

    it('CORRIGE LA FALLA OPERATIVA: Bloquea reserva de 4 comensales si solo existen dos mesas de 2', () => {
      // Supongamos que solo tenemos mesas de 2 personas (t-1 y t-2, aforo escalar = 4)
      const tablesTwoPaxOnly = [mockTables[0], mockTables[1]];

      const available = getAvailableTablesForSlot({
        tables: tablesTwoPaxOnly,
        reservations: [],
        slotTime: '14:00',
        partySize: 4,
      });

      // El modelo escalar antiguo permitía reservar porque 4 <= 4.
      // El modelo físico unificado bloquea correctamente porque ninguna mesa física alberga 4 personas.
      expect(available.length).toBe(0);
    });

    it('permite reservar cuando existe una mesa física adecuada para el grupo', () => {
      const available = getAvailableTablesForSlot({
        tables: mockTables,
        reservations: [],
        slotTime: '14:00',
        partySize: 4,
        zone: 'INTERIOR',
      });

      expect(available.length).toBe(1);
      expect(available[0].id).toBe('t-3'); // Mesa 3 (min 3, max 4)
    });

    it('aplica asignación óptima Best-Fit (prioriza la mesa más ajustada al grupo)', () => {
      // Un grupo de 2 personas puede usar mesa de 2 (t-1, t-2). No debe gastar la mesa de 8 (t-4).
      const available = getAvailableTablesForSlot({
        tables: mockTables,
        reservations: [],
        slotTime: '14:00',
        partySize: 2,
      });

      expect(available.length).toBe(2);
      expect(available[0].max_capacity).toBe(2); // Mesa ajustada a 2 comensales
    });

    it('bloquea la mesa si ya tiene una reserva confirmada o pendiente que solapa', () => {
      const reservations: MockReservation[] = [
        { table_id: 't-3', reservation_time: '14:00', status: 'CONFIRMADA', party_size: 4 },
      ];

      // A las 14:30 (dentro de la estancia de 90 min), la mesa 3 debe estar ocupada
      const available = getAvailableTablesForSlot({
        tables: mockTables,
        reservations,
        slotTime: '14:30',
        partySize: 4,
        zone: 'INTERIOR',
      });

      expect(available.length).toBe(0);
    });

    it('libera la mesa una vez transcurridos los 90 minutos de estancia', () => {
      const reservations: MockReservation[] = [
        { table_id: 't-3', reservation_time: '14:00', status: 'CONFIRMADA', party_size: 4 },
      ];

      // A las 15:30 (90 min después), la mesa vuelve a estar disponible
      const available = getAvailableTablesForSlot({
        tables: mockTables,
        reservations,
        slotTime: '15:30',
        partySize: 4,
        zone: 'INTERIOR',
      });

      expect(available.length).toBe(1);
      expect(available[0].id).toBe('t-3');
    });

    it('ignora mesas inactivas en el cálculo de disponibilidad', () => {
      const available = getAvailableTablesForSlot({
        tables: [mockTables[4]], // Mesa inactiva
        reservations: [],
        slotTime: '14:00',
        partySize: 2,
      });

      expect(available.length).toBe(0);
    });
  });
});
