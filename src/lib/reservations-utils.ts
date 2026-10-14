// src/lib/reservations-utils.ts
// Utilidades de aforo, slots preventivos y cálculo de alternativas para reservaciones (Feature 4)

import type { SlotAvailability, Zone, ZoneAvailabilityInfo } from './types';

export type SlotStatus = 'AVAILABLE' | 'LAST_SPOTS' | 'FULL';

/**
 * Determina el estado de un slot para una zona específica:
 * - 'FULL': sin mesas o capacidad disponible
 * - 'LAST_SPOTS': disponible pero con 4 o menos comensales libres o 1 sola mesa
 * - 'AVAILABLE': cupo normal disponible
 */
export function getSlotStatus(zoneInfo?: ZoneAvailabilityInfo | null): SlotStatus {
  if (!zoneInfo || !zoneInfo.canBook) return 'FULL';
  if (
    zoneInfo.available <= 4 ||
    (zoneInfo.availableTables && zoneInfo.availableTables.length <= 1)
  ) {
    return 'LAST_SPOTS';
  }
  return 'AVAILABLE';
}

/**
 * Convierte un formato HH:mm a minutos totales del día.
 */
export function timeToMinutes(timeStr: string): number {
  const [h, m] = (timeStr || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Busca el slot alternativo disponible más cercano dentro de una ventana máxima (por defecto 30 minutos).
 * Si targetTime ya está disponible, retorna null (no se necesita alternativa).
 * Si hay alternativas en ±30 min, retorna la más cercana.
 */
export function findClosestAvailableSlot(
  slots: SlotAvailability[],
  targetTime: string,
  zone: Zone,
  maxDiffMinutes = 30
): string | null {
  const targetMins = timeToMinutes(targetTime);
  let bestSlot: string | null = null;
  let minDiff = Infinity;

  for (const s of slots) {
    if (s.time === targetTime) continue;
    const canBook = s.zones?.[zone]?.canBook;
    if (!canBook) continue;

    const diff = Math.abs(timeToMinutes(s.time) - targetMins);
    if (diff <= maxDiffMinutes && diff < minDiff) {
      minDiff = diff;
      bestSlot = s.time;
    }
  }

  return bestSlot;
}

export interface ZoneOccupancyItem {
  capacity: number;
  reserved: number;
  percent: number;
  isOverCapacity: boolean;
}

/**
 * Calcula el aforo ocupado vs capacidad total por zona para una lista de reservaciones.
 * Identifica alertas preventivas de sobreaforo (>100% de la capacidad de mesas activas).
 */
export function calculateZoneOccupancy(
  reservations: Array<{ preferred_zone: Zone; party_size: number; status: string }>,
  capacities: Record<Zone, number>
): Record<Zone, ZoneOccupancyItem> {
  const activeStatuses = ['PENDIENTE', 'CONFIRMADA'];
  const result: Record<Zone, ZoneOccupancyItem> = {
    INTERIOR: { capacity: capacities.INTERIOR || 0, reserved: 0, percent: 0, isOverCapacity: false },
    TERRAZA: { capacity: capacities.TERRAZA || 0, reserved: 0, percent: 0, isOverCapacity: false },
    BARRA: { capacity: capacities.BARRA || 0, reserved: 0, percent: 0, isOverCapacity: false },
  };

  for (const r of reservations) {
    if (activeStatuses.includes(r.status) && result[r.preferred_zone]) {
      result[r.preferred_zone].reserved += (r.party_size || 0);
    }
  }

  for (const z of ['INTERIOR', 'TERRAZA', 'BARRA'] as Zone[]) {
    const item = result[z];
    if (item.capacity > 0) {
      item.percent = Math.min(100, Math.round((item.reserved / item.capacity) * 100));
      item.isOverCapacity = item.reserved > item.capacity;
    }
  }

  return result;
}
