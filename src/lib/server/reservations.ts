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
// MOTOR DE DISPONIBILIDAD Y ASIGNACIÓN DE MESAS FÍSICAS
// ---------------------------------------------------------------------------

export interface SlotAvailabilityParams {
  locationId: string;
  date: string;
  time: string;
  partySize: number;
  zone?: Zone;
  turnDurationMinutes?: number;
}

export interface SlotAvailabilityResult {
  available: boolean;
  bestTable: RestaurantTable | null;
  availableTables: RestaurantTable[];
  totalTablesAvailable: number;
}

/**
 * Valida la disponibilidad física para un horario y tamaño de grupo.
 * Prioriza la función RPC get_available_tables de Supabase con fallback seguro a TypeScript.
 */
export async function checkSlotAvailability({
  locationId,
  date,
  time,
  partySize,
  zone,
  turnDurationMinutes = AVERAGE_DINING_DURATION_MINUTES,
}: SlotAvailabilityParams): Promise<SlotAvailabilityResult> {
  const supabase = createServerClient();

  const [hours, minutes] = time.split(':').map(Number);
  const startMinutes = (hours || 0) * 60 + (minutes || 0);
  const endMinutes = startMinutes + turnDurationMinutes;
  const endHoursVal = Math.floor(endMinutes / 60) % 24;
  const endMinutesVal = endMinutes % 60;
  const endTime = `${String(endHoursVal).padStart(2, '0')}:${String(endMinutesVal).padStart(2, '0')}:00`;

  // 1. Intentar invocar función optimizada de PostgreSQL get_available_tables
  try {
    const { data: rpcTables, error: rpcError } = await supabase.rpc('get_available_tables', {
      p_location_id: locationId,
      p_date: date,
      p_start_time: `${time}:00`,
      p_end_time: endTime,
      p_party_size: partySize,
      p_zone: zone || null,
    });

    if (!rpcError && Array.isArray(rpcTables)) {
      const formatted: RestaurantTable[] = rpcTables.map((t: any) => ({
        id: t.table_id || t.id,
        location_id: locationId,
        table_number: t.table_number,
        min_capacity: t.min_capacity,
        max_capacity: t.max_capacity,
        zone: t.zone as Zone,
        is_active: true,
        status: 'LIBRE',
        qr_status: 'INACTIVO',
        qr_token: '',
        created_at: '',
        updated_at: '',
      }));

      return {
        available: formatted.length > 0,
        bestTable: formatted[0] || null,
        availableTables: formatted,
        totalTablesAvailable: formatted.length,
      };
    }
  } catch {
    // Si la RPC no está instalada, continuar al fallback en TypeScript
  }

  // 2. Fallback de seguridad en TypeScript: consulta física directa a restaurant_tables y reservations
  const [{ data: rawTables }, { data: dayReservations }] = await Promise.all([
    supabase
      .from('restaurant_tables')
      .select('*')
      .eq('location_id', locationId)
      .eq('is_active', true),
    supabase
      .from('reservations')
      .select('id, table_id, reservation_time, status')
      .eq('location_id', locationId)
      .eq('reservation_date', date)
      .in('status', ['PENDIENTE', 'CONFIRMADA']),
  ]);

  const activeTables = (rawTables || []) as RestaurantTable[];
  const activeReservations = dayReservations || [];

  const occupiedTableIds = new Set(
    activeReservations
      .filter((r) => r.table_id && isTimeOverlapping(r.reservation_time, time, turnDurationMinutes))
      .map((r) => r.table_id)
  );

  const availableTables = activeTables
    .filter((t) => {
      if (zone && t.zone !== zone) return false;
      if (partySize < (t.min_capacity || 1) || partySize > t.max_capacity) return false;
      if (occupiedTableIds.has(t.id)) return false;
      return true;
    })
    .sort((a, b) => a.max_capacity - b.max_capacity || a.table_number.localeCompare(b.table_number));

  return {
    available: availableTables.length > 0,
    bestTable: availableTables[0] || null,
    availableTables,
    totalTablesAvailable: availableTables.length,
  };
}

// ---------------------------------------------------------------------------
// FUNCIONES PÚBLICAS (CLIENTE FRONTEND)
// ---------------------------------------------------------------------------

/**
 * Obtiene los datos de la sucursal y el aforo por zona calculado dinámicamente
 * a partir de las mesas físicas activas.
 */
export async function getPublicLocalReservationConfig(slug: string) {
  const local = await getLocalBySlug(slug);
  if (!local) {
    return { ok: false, error: 'Sucursal no encontrada' };
  }

  const supabase = createServerClient();
  const { data: tables, error } = await supabase
    .from('restaurant_tables')
    .select('zone, max_capacity')
    .eq('location_id', local.id)
    .eq('is_active', true);

  if (error) {
    console.error('getPublicLocalReservationConfig error:', error);
  }

  const zoneCapMap: Record<Zone, number> = {
    INTERIOR: 0,
    TERRAZA: 0,
    BARRA: 0,
  };

  (tables || []).forEach((t) => {
    const z = t.zone as Zone;
    if (zoneCapMap[z] !== undefined) {
      zoneCapMap[z] += t.max_capacity || 0;
    }
  });

  const zonesList: Zone[] = ['INTERIOR', 'TERRAZA', 'BARRA'];
  const activeZones = zonesList
    .filter((z) => zoneCapMap[z] > 0)
    .map((zone) => ({
      zone,
      capacity: zoneCapMap[zone],
      label: zone === 'INTERIOR' ? 'Interior' : zone === 'TERRAZA' ? 'Terraza' : 'Barra',
      description: 
        zone === 'INTERIOR' ? 'Salón principal climatizado' : 
        zone === 'TERRAZA' ? 'Área al aire libre' : 
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
 * Calcula la disponibilidad de horarios, zonas y mesas físicas para una fecha y número de comensales.
 * La disponibilidad se determina estrictamente por la presencia de mesas físicas aptas no ocupadas.
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

  // 1. Obtener mesas físicas configuradas en el local
  const { data: rawTables } = await supabase
    .from('restaurant_tables')
    .select('*')
    .eq('location_id', local.id)
    .eq('is_active', true);
  const tables = (rawTables || []) as RestaurantTable[];

  // 2. Obtener reservas activas para ese día
  const { data: dayReservations } = await supabase
    .from('reservations')
    .select('id, reservation_time, preferred_zone, party_size, status, table_id')
    .eq('location_id', local.id)
    .eq('reservation_date', date)
    .in('status', ['PENDIENTE', 'CONFIRMADA']);

  const activeReservations = dayReservations || [];

  // 3. Generar franjas horarias según los turnos configurados del local
  const { slots: generatedSlots } = await getGeneratedSlotsForDate(local.id, date);

  // 4. Comprobar fecha actual para anticipación
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
      const maxCap = zoneTables.reduce((acc, t) => acc + t.max_capacity, 0);

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

      // Encontrar mesas que físicamente tengan capacidad para el grupo solicitado
      const suitableTables = zoneTables.filter(
        (t) => t.max_capacity >= partySize && partySize >= (t.min_capacity || 1)
      );

      // Mesas ya ocupadas por reservas concurrentes
      const occupiedTableIds = new Set(
        overlappingReservations.map((r) => r.table_id).filter(Boolean)
      );

      const availableTablesForParty = suitableTables
        .filter((t) => {
          if (occupiedTableIds.has(t.id)) return false;
          // Si es hoy y la mesa está ocupada presencialmente en este momento
          if (isToday && t.status === 'OCUPADA' && Math.abs(slotMinutes - currentMinutes) < turnDurationMinutes) {
            return false;
          }
          return true;
        })
        .sort((a, b) => a.max_capacity - b.max_capacity || a.table_number.localeCompare(b.table_number));

      // La disponibilidad real exige que exista al menos una mesa física disponible
      const canBook = availableTablesForParty.length > 0;
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
 * Asigna de forma obligatoria la mesa óptima (o valida la mesa elegida) y evita sobreventa física.
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

  // Validar disponibilidad física real de mesas para este grupo
  const { available, bestTable, availableTables } = await checkSlotAvailability({
    locationId: local.id,
    date: validated.reservation_date,
    time: validated.reservation_time,
    partySize: validated.party_size,
    zone: validated.preferred_zone,
  });

  if (!available || !bestTable) {
    return {
      ok: false,
      error: 'No hay mesas disponibles con la capacidad requerida para este horario y zona.',
    };
  }

  let assignedTableId = validated.table_id || null;
  if (assignedTableId) {
    const isChosenTableFree = availableTables.some((t) => t.id === assignedTableId);
    if (!isChosenTableFree) {
      return {
        ok: false,
        error: 'La mesa seleccionada acaba de ser ocupada para este horario. Por favor selecciona otra mesa o continúa para asignarte la mejor disponible.',
      };
    }
  } else {
    // Asignación automática óptima (Best-Fit)
    assignedTableId = bestTable.id;
  }

  const supabase = createServerClient();

  // Insertar reserva vinculando la mesa física asignada
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

  // Validar y auto-asignar mesa física si no se especificó manualmente
  let assignedTableId = validated.table_id || null;
  if (!assignedTableId) {
    const { available, bestTable } = await checkSlotAvailability({
      locationId: staff.location_id,
      date: validated.reservation_date,
      time: validated.reservation_time,
      partySize: validated.party_size,
      zone: validated.preferred_zone,
    });
    if (available && bestTable) {
      assignedTableId = bestTable.id;
    }
  }

  const data = await queryOrThrow(
    supabase
      .from('reservations')
      .insert({
        ...validated,
        table_id: assignedTableId,
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

// --- Zone Capacity Management (Calculado en tiempo real desde restaurant_tables) ---

/**
 * Obtiene el aforo de cada zona calculado dinámicamente sumando
 * las capacidades máximas de las mesas físicas activas.
 */
export async function getZoneCapacities(): Promise<Array<{ zone: Zone; capacity: number }>> {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  const { data: tables, error } = await supabase
    .from('restaurant_tables')
    .select('zone, max_capacity')
    .eq('location_id', staff.location_id)
    .eq('is_active', true);

  if (error) {
    console.error('getZoneCapacities:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudo cargar el aforo por zona.'));
  }

  const map: Record<Zone, number> = { INTERIOR: 0, TERRAZA: 0, BARRA: 0 };
  (tables || []).forEach((t) => {
    const z = t.zone as Zone;
    if (map[z] !== undefined) map[z] += t.max_capacity || 0;
  });

  return (Object.entries(map) as [Zone, number][]).map(([zone, capacity]) => ({
    zone,
    capacity,
  }));
}

/**
 * @deprecated El aforo manual ha sido sustituido por la suma de capacidades de mesas activas en AdminTableManager.
 * Esta función se mantiene por compatibilidad y devuelve el aforo calculado actual.
 */
export async function upsertZoneCapacity(zone: Zone, _capacity: number) {
  const caps = await getZoneCapacities();
  const current = caps.find((c) => c.zone === zone);
  return { zone, capacity: current ? current.capacity : 0 };
}

/**
 * Obtiene el resumen de ocupación del día por zona para la vista de estadísticas del admin.
 * La capacidad total se deriva directamente de las mesas activas en restaurant_tables.
 */
export async function getDailyOccupancyStats(date: string) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  const [{ data: tables }, { data: reservations }] = await Promise.all([
    supabase
      .from('restaurant_tables')
      .select('zone, max_capacity')
      .eq('location_id', staff.location_id)
      .eq('is_active', true),
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

  (tables || []).forEach((t) => {
    const z = t.zone as Zone;
    if (zoneStats[z]) zoneStats[z].capacity += t.max_capacity || 0;
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
