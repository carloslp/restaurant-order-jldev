import { describe, it, expect } from 'vitest';
import { isValidPhone, isValidName } from '@/lib/validation';
import type { Zone, ZoneAvailabilityInfo, SlotAvailability } from '@/lib/types';

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

// Simulación de cálculo de disponibilidad de aforo
function calculateAvailabilityForSlot({
  slotTime,
  zone,
  capacity,
  reservations,
  partySize,
}: {
  slotTime: string;
  zone: Zone;
  capacity: number;
  reservations: Array<{ reservation_time: string; preferred_zone: Zone; party_size: number; status: string }>;
  partySize: number;
}): ZoneAvailabilityInfo {
  if (capacity <= 0) {
    return {
      zone,
      capacity: 0,
      reserved: 0,
      available: 0,
      canBook: false,
    };
  }

  const activeReservations = reservations.filter(
    (r) =>
      r.preferred_zone === zone &&
      ['PENDIENTE', 'CONFIRMADA'].includes(r.status) &&
      isTimeOverlapping(r.reservation_time, slotTime)
  );

  const reserved = activeReservations.reduce((sum, r) => sum + r.party_size, 0);
  const available = Math.max(0, capacity - reserved);
  const canBook = available >= partySize;

  return {
    zone,
    capacity,
    reserved,
    available,
    canBook,
  };
}

describe('Reservation System - Validation & Capacity Engine', () => {
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
      // Misma hora
      expect(isTimeOverlapping('14:00', '14:00')).toBe(true);
      // 30 minutos después
      expect(isTimeOverlapping('14:00', '14:30')).toBe(true);
      // 60 minutos después
      expect(isTimeOverlapping('14:00', '15:00')).toBe(true);
      // 89 minutos después
      expect(isTimeOverlapping('14:00', '15:29')).toBe(true);
    });

    it('identifies non-overlapping slots outside 90 minute dining window', () => {
      // 90 minutos después (libera mesa)
      expect(isTimeOverlapping('14:00', '15:30')).toBe(false);
      // 2 horas después
      expect(isTimeOverlapping('14:00', '16:00')).toBe(false);
      // Turno de cena vs comida
      expect(isTimeOverlapping('14:00', '20:00')).toBe(false);
    });
  });

  describe('Zone Capacity & Overbooking Prevention', () => {
    it('allows booking when capacity is fully available', () => {
      const result = calculateAvailabilityForSlot({
        slotTime: '14:00',
        zone: 'INTERIOR',
        capacity: 30,
        reservations: [],
        partySize: 4,
      });

      expect(result.capacity).toBe(30);
      expect(result.reserved).toBe(0);
      expect(result.available).toBe(30);
      expect(result.canBook).toBe(true);
    });

    it('deducts active reservations (PENDIENTE and CONFIRMADA) from capacity', () => {
      const reservations = [
        { reservation_time: '14:00', preferred_zone: 'INTERIOR' as Zone, party_size: 4, status: 'CONFIRMADA' },
        { reservation_time: '14:30', preferred_zone: 'INTERIOR' as Zone, party_size: 6, status: 'PENDIENTE' },
      ];

      const result = calculateAvailabilityForSlot({
        slotTime: '14:00',
        zone: 'INTERIOR',
        capacity: 20,
        reservations,
        partySize: 10,
      });

      // 4 + 6 = 10 comensales ocupados; disponibles = 10; partySize = 10 cabe exacto
      expect(result.reserved).toBe(10);
      expect(result.available).toBe(10);
      expect(result.canBook).toBe(true);
    });

    it('blocks booking when requested party exceeds available capacity', () => {
      const reservations = [
        { reservation_time: '14:00', preferred_zone: 'TERRAZA' as Zone, party_size: 15, status: 'CONFIRMADA' },
      ];

      const result = calculateAvailabilityForSlot({
        slotTime: '14:00',
        zone: 'TERRAZA',
        capacity: 20,
        reservations,
        partySize: 6, // 15 ocupados + 6 solicitados = 21 > 20
      });

      expect(result.available).toBe(5);
      expect(result.canBook).toBe(false);
    });

    it('ignores CANCELADA and NO_SHOW reservations in capacity calculation', () => {
      const reservations = [
        { reservation_time: '14:00', preferred_zone: 'BARRA' as Zone, party_size: 6, status: 'CANCELADA' },
        { reservation_time: '14:00', preferred_zone: 'BARRA' as Zone, party_size: 2, status: 'NO_SHOW' },
      ];

      const result = calculateAvailabilityForSlot({
        slotTime: '14:00',
        zone: 'BARRA',
        capacity: 8,
        reservations,
        partySize: 8,
      });

      expect(result.reserved).toBe(0);
      expect(result.available).toBe(8);
      expect(result.canBook).toBe(true);
    });

    it('disables booking if zone capacity is set to 0', () => {
      const result = calculateAvailabilityForSlot({
        slotTime: '14:00',
        zone: 'BARRA',
        capacity: 0,
        reservations: [],
        partySize: 2,
      });

      expect(result.canBook).toBe(false);
      expect(result.available).toBe(0);
    });
  });
});
