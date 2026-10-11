// src/lib/server/reservations.ts
'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getCurrentStaff } from '@/app/staff/page';
import { getLocalBySlug } from '@/lib/server/local';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { AppError, parseOrThrow, parsePostgrestError, queryOrThrow } from '@/lib/errors';
import { zNumberES, isValidPhone, isValidName } from '@/lib/validation';
import type { 
  ReservationStatus, 
  Zone, 
  PublicReservationInput, 
  SlotAvailability, 
  ZoneAvailabilityInfo,
  Reservation,
  RestaurantTable
} from '@/lib/types';

import { getGeneratedSlotsForDate } from '@/lib/server/schedules';

// --- Schemas ---

const ReservationSchema = z.object({
  holder_name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  holder_phone: z.string().refine(isValidPhone, 'Ingresa un teléfono válido (8 a 16 dígitos)'),
  reservation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  reservation_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato de hora inválido (HH:mm)'),
  party_size: zNumberES('El número de comensales debe ser un número')
    .int('Debe ser un número entero')
    .min(1, 'Mínimo 1 comensal')
    .max(50, 'Para grupos de más de 50 personas, por favor contáctanos directamente'),
  preferred_zone: z.enum(['INTERIOR', 'TERRAZA', 'BARRA'], { message: 'Elige una zona válida' }),
  table_id: z.string().uuid().nullish(),
  status: z.enum(['PENDIENTE', 'CONFIRMADA', 'CANCELADA', 'NO_SHOW']).default('PENDIENTE'),
  deposit_status: z.enum(['SIN_DEPOSITO', 'DEPOSITO_PENDIENTE', 'DEPOSITADO']).default('SIN_DEPOSITO'),
  notes: z.string().max(500, 'Las notas no pueden exceder 500 caracteres').nullish(),
});

const PublicReservationSchema = z.object({
  location_slug: z.string().min(1, 'Sucursal no especificada'),
  holder_name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  holder_phone: z.string().refine(isValidPhone, 'Ingresa un teléfono válido (8 a 16 dígitos)'),
  reservation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  reservation_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato de hora inválido (HH:mm)'),
  party_size: zNumberES('El número de comensales debe ser un número')
    .int('Debe ser un número entero')
    .min(1, 'Mínimo 1 comensal')
    .max(30, 'Para reservas de más de 30 personas, por favor contacta al restaurante directamente'),
  preferred_zone: z.enum(['INTERIOR', 'TERRAZA', 'BARRA'], { message: 'Elige una zona válida' }),
  table_id: z.string().uuid().nullish(),
  notes: z.string().max(500, 'Las notas no pueden exceder 500 caracteres').nullish(),
});

async function getStaffContext() {
  const { staff } = await getCurrentStaff();
  return staff;
}

// Configuración de franjas horarias estándar (30 minutos)
const STANDARD_SLOTS = [
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00', '19:30', '20:00', '20:30',
  '21:00', '21:30', '22:00'
];

const AVERAGE_DINING_DURATION_MINUTES = 90;

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function isTimeOverlapping(timeA: string, timeB: string, durationMinutes = AVERAGE_DINING_DURATION_MINUTES): boolean {
  const a = timeToMinutes(timeA);
  const b = timeToMinutes(timeB);
  return Math.abs(a - b) < durationMinutes;
}

// ---------------------------------------------------------------------------
// FUNCIONES PÚBLICAS (CLIENTE FRONTEND)
// ---------------------------------------------------------------------------

/**
 * Obtiene los datos de la sucursal y la capacidad de sus zonas activas.
 */
export async function getPublicLocalReservationConfig(slug: string) {
  const local = await getLocalBySlug(slug);
  if (!local) {
    return { ok: false, error: 'Sucursal no encontrada' };
  }

  const supabase = createServerClient();
  const { data: capacities, error } = await supabase
    .from('local_zone_capacity')
    .select('zone, capacity')
    .eq('location_id', local.id)
    .gt('capacity', 0);

  if (error) {
    console.error('getPublicLocalReservationConfig error:', error);
  }

  const activeZones = (capacities || []).map((c) => ({
    zone: c.zone as Zone,
    capacity: c.capacity,
    label: c.zone === 'INTERIOR' ? 'Interior' : c.zone === 'TERRAZA' ? 'Terraza' : 'Barra',
    description: 
      c.zone === 'INTERIOR' ? 'Salón principal climatizado' : 
      c.zone === 'TERRAZA' ? 'Área al aire libre' : 
      'Asientos en barra principal'
  }));

  return {
    ok: true,
    local: {
      id: local.id,
      name: local.name,
      slug: local.slug,
      is_open: local.is_open,
      address: local.address,
    },
    zones: activeZones,
  };
}

/**
 * Calcula la disponibilidad de horarios y zonas para una fecha y número de comensales.
 */
/**
 * Calcula la disponibilidad de horarios, zonas y mesas para una fecha y número de comensales.
 */
export async function getPublicAvailability(
  slug: string, 
  date: string, 
  partySize: number
): Promise<{ ok: boolean; slots: SlotAvailability[]; error?: string }> {
  const local = await getLocalBySlug(slug);
  if (!local) {
    return { ok: false, slots: [], error: 'Sucursal no encontrada' };
  }

  if (local.reservations_enabled === false) {
    return { ok: false, slots: [], error: 'Las reservaciones en línea están desactivadas temporalmente para esta sucursal.' };
  }

  if (partySize < 1) {
    return { ok: false, slots: [], error: 'El número de comensales debe ser al menos 1' };
  }

  const supabase = createServerClient();

  // 1. Obtener capacidades agregadas por zona
  const { data: capacities } = await supabase
    .from('local_zone_capacity')
    .select('zone, capacity')
    .eq('location_id', local.id);

  const zoneCapMap: Record<Zone, number> = {
    INTERIOR: 0,
    TERRAZA: 0,
    BARRA: 0,
  };
  (capacities || []).forEach((c) => {
    zoneCapMap[c.zone as Zone] = c.capacity;
  });

  // 2. Obtener mesas físicas configuradas en el local
  const { data: rawTables } = await supabase
    .from('restaurant_tables')
    .select('*')
    .eq('location_id', local.id)
    .eq('is_active', true);
  const tables = (rawTables || []) as RestaurantTable[];

  // 3. Obtener reservas activas para ese día
  const { data: dayReservations } = await supabase
    .from('reservations')
    .select('id, reservation_time, preferred_zone, party_size, status, table_id')
    .eq('location_id', local.id)
    .eq('reservation_date', date)
    .in('status', ['PENDIENTE', 'CONFIRMADA']);

  const activeReservations = dayReservations || [];

  // 4. Generar franjas horarias según los turnos configurados del local
  const { slots: generatedSlots } = await getGeneratedSlotsForDate(local.id, date);

  // 5. Comprobar fecha actual
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const isToday = date === todayStr;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const zones: Zone[] = ['INTERIOR', 'TERRAZA', 'BARRA'];

  const slots: SlotAvailability[] = generatedSlots.map(({ time: slotTime, turnDurationMinutes }) => {
    const slotMinutes = timeToMinutes(slotTime);
    
    // Si es hoy, requerimos al menos 60 minutos de anticipación
    const isPast = isToday && (slotMinutes <= currentMinutes + 60);

    const zonesInfo = {} as Record<Zone, ZoneAvailabilityInfo>;
    let anyZoneAvailable = false;

    zones.forEach((zone) => {
      const zoneTables = tables.filter((t) => t.zone === zone);
      const hasPhysicalTables = zoneTables.length > 0;
      const maxCap = hasPhysicalTables 
        ? zoneTables.reduce((acc, t) => acc + t.max_capacity, 0)
        : (zoneCapMap[zone] || 0);

      if (maxCap === 0 || isPast) {
        zonesInfo[zone] = {
          zone,
          capacity: maxCap,
          reserved: 0,
          available: 0,
          canBook: false,
          availableTables: [],
        };
        return;
      }

      // Reservas que solapan esta franja horaria
      const overlappingReservations = activeReservations.filter(
        (r) => r.preferred_zone === zone && isTimeOverlapping(r.reservation_time, slotTime, turnDurationMinutes)
      );

      const reservedPax = overlappingReservations.reduce((sum, r) => sum + (r.party_size || 0), 0);
      const availablePax = Math.max(0, maxCap - reservedPax);

      let canBook = false;
      let availableTablesForParty: RestaurantTable[] = [];

      if (hasPhysicalTables) {
        // Encontrar mesas que tengan capacidad para el grupo
        const suitableTables = zoneTables.filter(
          (t) => t.max_capacity >= partySize && partySize >= (t.min_capacity || 1)
        );

        // Identificar qué mesas ya están ocupadas por reservas concurrentes
        const occupiedTableIds = new Set(
          overlappingReservations.map((r) => r.table_id).filter(Boolean)
        );

        availableTablesForParty = suitableTables.filter((t) => {
          if (occupiedTableIds.has(t.id)) return false;
          // Si es hoy y la mesa está ocupada presencialmente en este momento
          if (isToday && t.status === 'OCUPADA' && Math.abs(slotMinutes - currentMinutes) < turnDurationMinutes) {
            return false;
          }
          return true;
        });

        canBook = availableTablesForParty.length > 0 && availablePax >= partySize;
      } else {
        canBook = availablePax >= partySize;
      }

      if (canBook) anyZoneAvailable = true;

      zonesInfo[zone] = {
        zone,
        capacity: maxCap,
        reserved: reservedPax,
        available: availablePax,
        canBook,
        availableTables: availableTablesForParty,
      };
    });

    return {
      time: slotTime,
      zones: zonesInfo,
      isAvailable: !isPast && anyZoneAvailable,
    };
  });

  return { ok: true, slots };
}

/**
 * Crea una reserva pública desde el frontend del cliente.
 * Se crea en estado 'PENDIENTE' para que el staff/admin la acepte o gestione.
 */
export async function createPublicReservation(payload: PublicReservationInput) {
  const validated = parseOrThrow(PublicReservationSchema, payload);

  const local = await getLocalBySlug(validated.location_slug);
  if (!local) {
    return { ok: false, error: 'Sucursal no encontrada' };
  }

  if (local.reservations_enabled === false) {
    return { ok: false, error: 'Las reservaciones en línea están desactivadas temporalmente para esta sucursal.' };
  }

  // Validar que la fecha y hora sean futuras
  const reservationDateTimeStr = `${validated.reservation_date}T${validated.reservation_time}:00`;
  const reservationDateTime = new Date(reservationDateTimeStr);
  const now = new Date();

  if (isNaN(reservationDateTime.getTime()) || reservationDateTime <= now) {
    return { ok: false, error: 'La fecha y hora de la reserva deben ser en el futuro.' };
  }

  const supabase = createServerClient();

  // Verificar reservas existentes concurrentes para prevenir sobreventa
  const { data: existingReservations } = await supabase
    .from('reservations')
    .select('id, party_size, reservation_time, table_id')
    .eq('location_id', local.id)
    .eq('reservation_date', validated.reservation_date)
    .eq('preferred_zone', validated.preferred_zone)
    .in('status', ['PENDIENTE', 'CONFIRMADA']);

  // Si se eligió una mesa específica, comprobar que no esté tomada
  let assignedTableId = validated.table_id || null;
  if (assignedTableId) {
    const tableConflict = (existingReservations || []).some(
      (r) => r.table_id === assignedTableId && isTimeOverlapping(r.reservation_time, validated.reservation_time)
    );
    if (tableConflict) {
      return {
        ok: false,
        error: 'La mesa seleccionada acaba de ser ocupada para este horario. Por favor selecciona otra mesa o elige cualquiera disponible.',
      };
    }
  }

  // Insertar reserva
  const { data: reservation, error } = await supabase
    .from('reservations')
    .insert({
      location_id: local.id,
      holder_name: validated.holder_name.trim(),
      holder_phone: validated.holder_phone.trim(),
      reservation_date: validated.reservation_date,
      reservation_time: validated.reservation_time,
      party_size: validated.party_size,
      preferred_zone: validated.preferred_zone,
      table_id: assignedTableId,
      status: 'PENDIENTE',
      deposit_status: 'SIN_DEPOSITO',
      notes: validated.notes?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    console.error('createPublicReservation error:', error);
    return { ok: false, error: parsePostgrestError(error, 'No se pudo registrar la reserva.') };
  }

  revalidatePath('/staff/admin');
  revalidatePath(`/${validated.location_slug}/reservar`);

  return { 
    ok: true, 
    reservation: reservation as Reservation,
    folio: reservation.id.slice(0, 8).toUpperCase(),
  };
}

// ---------------------------------------------------------------------------
// FUNCIONES DE ADMINISTRACIÓN (STAFF / ADMIN)
// ---------------------------------------------------------------------------

/**
 * Obtiene la cantidad de reservas pendientes de aprobación para el local del staff.
 */
export async function getPendingReservationsCount(): Promise<number> {
  try {
    const staff = await getStaffContext();
    const supabase = createServerClient();

    const { count, error } = await supabase
      .from('reservations')
      .select('*', { count: 'exact', head: true })
      .eq('location_id', staff.location_id)
      .eq('status', 'PENDIENTE');

    if (error) {
      console.error('getPendingReservationsCount:', error);
      return 0;
    }
    return count || 0;
  } catch {
    return 0;
  }
}

/**
 * Acepta una reserva pendiente cambiándola a CONFIRMADA.
 */
export async function acceptReservation(id: string) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('reservations')
    .update({
      status: 'CONFIRMADA',
      updated_by: staff.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('location_id', staff.location_id)
    .select()
    .single();

  if (error) {
    console.error('acceptReservation:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudo confirmar la reserva.'));
  }

  revalidatePath('/staff/admin');
  return { ok: true, reservation: data };
}

/**
 * Rechaza o cancela una reserva con un motivo opcional.
 */
export async function rejectReservation(id: string, reason?: string) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  // Obtener notas actuales para anexar motivo si aplica
  const { data: current } = await supabase
    .from('reservations')
    .select('notes')
    .eq('id', id)
    .eq('location_id', staff.location_id)
    .single();

  let updatedNotes = current?.notes || '';
  if (reason && reason.trim()) {
    updatedNotes = updatedNotes 
      ? `${updatedNotes} [Cancelada: ${reason.trim()}]` 
      : `[Cancelada: ${reason.trim()}]`;
  }

  const { data, error } = await supabase
    .from('reservations')
    .update({
      status: 'CANCELADA',
      notes: updatedNotes || null,
      updated_by: staff.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('location_id', staff.location_id)
    .select()
    .single();

  if (error) {
    console.error('rejectReservation:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudo cancelar la reserva.'));
  }

  revalidatePath('/staff/admin');
  return { ok: true, reservation: data };
}

/**
 * Reasigna o cambia la mesa física asignada a una reserva.
 */
export async function reassignReservationTable(reservationId: string, tableId: string | null) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('reservations')
    .update({
      table_id: tableId,
      updated_by: staff.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reservationId)
    .eq('location_id', staff.location_id)
    .select()
    .single();

  if (error) {
    console.error('reassignReservationTable error:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudo reasignar la mesa.'));
  }

  revalidatePath('/staff/admin');
  return { ok: true, reservation: data };
}

/**
 * Lista las reservas por rango de fechas y filtro opcional por estado.
 */
export async function listReservations(startDate: string, endDate: string, status?: ReservationStatus) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  let query = supabase
    .from('reservations')
    .select('*')
    .eq('location_id', staff.location_id)
    .gte('reservation_date', startDate)
    .lte('reservation_date', endDate)
    .order('reservation_date', { ascending: true })
    .order('reservation_time', { ascending: true });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) {
    console.error('listReservations:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudieron cargar las reservas.'));
  }
  return data || [];
}

/**
 * Obtiene todas las reservas pendientes para la bandeja de entrada del admin.
 */
export async function listPendingReservations() {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('location_id', staff.location_id)
    .eq('status', 'PENDIENTE')
    .order('reservation_date', { ascending: true })
    .order('reservation_time', { ascending: true });

  if (error) {
    console.error('listPendingReservations:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudieron cargar las reservas pendientes.'));
  }
  return data || [];
}

export async function createReservation(payload: z.infer<typeof ReservationSchema>) {
  const staff = await getStaffContext();
  const validated = parseOrThrow(ReservationSchema, payload);
  const supabase = createServerClient();

  const data = await queryOrThrow(
    supabase
      .from('reservations')
      .insert({
        ...validated,
        location_id: staff.location_id,
        created_by: staff.id,
      })
      .select()
      .single(),
    { action: 'createReservation', fallback: 'No se pudo crear la reserva. Inténtalo de nuevo.' }
  );

  revalidatePath('/staff/admin');
  return data;
}

export async function updateReservation(id: string, payload: Partial<z.infer<typeof ReservationSchema>>) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  const { data: res } = await supabase
    .from('reservations')
    .select('id')
    .eq('id', id)
    .eq('location_id', staff.location_id)
    .single();

  if (!res) throw new AppError('Reserva no encontrada. Es posible que ya haya sido eliminada.');

  const partial = parseOrThrow(ReservationSchema.partial(), payload);

  const data = await queryOrThrow(
    supabase
      .from('reservations')
      .update({
        ...partial,
        updated_by: staff.id,
      })
      .eq('id', id)
      .select()
      .single(),
    { action: 'updateReservation', fallback: 'No se pudo actualizar la reserva.' }
  );

  revalidatePath('/staff/admin');
  return data;
}

export async function deleteReservation(id: string) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('reservations')
    .delete()
    .eq('id', id)
    .eq('location_id', staff.location_id);

  if (error) {
    console.error('deleteReservation:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudo eliminar la reserva.'));
  }

  revalidatePath('/staff/admin');
  return { ok: true };
}

export async function changeReservationStatus(id: string, status: ReservationStatus) {
  return updateReservation(id, { status });
}

// --- Zone Capacity Management (Mesas y Aforo por Local) ---

export async function getZoneCapacities() {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('local_zone_capacity')
    .select('zone, capacity')
    .eq('location_id', staff.location_id);

  if (error) {
    console.error('getZoneCapacities:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudo cargar el aforo por zona.'));
  }
  return data || [];
}

export async function upsertZoneCapacity(zone: Zone, capacity: number) {
  const staff = await getStaffContext();
  const cap = parseOrThrow(
    z.object({
      zone: z.enum(['INTERIOR', 'TERRAZA', 'BARRA'], { message: 'Zona inválida.' }),
      capacity: zNumberES('La capacidad debe ser un número')
        .int('La capacidad debe ser entera')
        .min(0, 'La capacidad no puede ser negativa')
        .max(1000, 'Máximo 1000 comensales por zona'),
    }),
    { zone, capacity }
  );
  const supabase = createServerClient();

  if (cap.capacity === 0) {
    const { error } = await supabase
      .from('local_zone_capacity')
      .delete()
      .eq('location_id', staff.location_id)
      .eq('zone', cap.zone);

    if (error) {
      console.error('upsertZoneCapacity/delete:', error);
      throw new AppError(parsePostgrestError(error, 'No se pudo actualizar el aforo.'));
    }
    revalidatePath('/staff/admin');
    return { zone: cap.zone, capacity: 0 };
  }

  const data = await queryOrThrow(
    supabase
      .from('local_zone_capacity')
      .upsert(
        { location_id: staff.location_id, zone: cap.zone, capacity: cap.capacity },
        { onConflict: 'location_id,zone' }
      )
      .select('zone, capacity')
      .single(),
    { action: 'upsertZoneCapacity', fallback: 'No se pudo actualizar el aforo.' }
  );

  revalidatePath('/staff/admin');
  return data;
}

/**
 * Obtiene el resumen de ocupación del día por zona para la vista de estadísticas del admin.
 */
export async function getDailyOccupancyStats(date: string) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  const [{ data: capacities }, { data: reservations }] = await Promise.all([
    supabase
      .from('local_zone_capacity')
      .select('zone, capacity')
      .eq('location_id', staff.location_id),
    supabase
      .from('reservations')
      .select('preferred_zone, party_size, status')
      .eq('location_id', staff.location_id)
      .eq('reservation_date', date)
      .in('status', ['PENDIENTE', 'CONFIRMADA']),
  ]);

  const zoneStats: Record<Zone, { capacity: number; booked: number; pendingCount: number; confirmedCount: number }> = {
    INTERIOR: { capacity: 0, booked: 0, pendingCount: 0, confirmedCount: 0 },
    TERRAZA: { capacity: 0, booked: 0, pendingCount: 0, confirmedCount: 0 },
    BARRA: { capacity: 0, booked: 0, pendingCount: 0, confirmedCount: 0 },
  };

  (capacities || []).forEach((c) => {
    const z = c.zone as Zone;
    if (zoneStats[z]) zoneStats[z].capacity = c.capacity;
  });

  (reservations || []).forEach((r) => {
    const z = r.preferred_zone as Zone;
    if (zoneStats[z]) {
      zoneStats[z].booked += r.party_size || 0;
      if (r.status === 'PENDIENTE') zoneStats[z].pendingCount += 1;
      if (r.status === 'CONFIRMADA') zoneStats[z].confirmedCount += 1;
    }
  });

  return zoneStats;
}
