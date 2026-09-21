// src/lib/server/schedules.ts
'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getCurrentStaff } from '@/app/staff/page';
import { revalidatePath } from 'next/cache';
import { AppError, parseOrThrow, parsePostgrestError, queryOrThrow } from '@/lib/errors';
import { z } from 'zod';
import type { LocalShift } from '@/lib/types';

const ShiftSchema = z.object({
  id: z.string().uuid().optional(),
  day_of_week: z.number().int().min(0).max(6),
  shift_name: z.string().min(1, 'El nombre del turno es obligatorio'),
  open_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato HH:mm'),
  close_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato HH:mm'),
  slot_interval_minutes: z.number().int().min(5).max(120).default(30),
  turn_duration_minutes: z.number().int().min(15).max(360).default(90),
  buffer_minutes: z.number().int().min(0).max(60).default(15),
  is_active: z.boolean().default(true),
});

async function getStaffContext() {
  const { staff } = await getCurrentStaff();
  return staff;
}

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Obtiene todos los turnos configurados para el local actual del staff.
 */
export async function getStaffLocalShifts(): Promise<LocalShift[]> {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('local_shifts')
    .select('*')
    .eq('location_id', staff.location_id)
    .order('day_of_week', { ascending: true })
    .order('open_time', { ascending: true });

  if (error) {
    // Si la tabla aún no se ha creado en Supabase, responder vacío sin romper la vista
    if (error.code === '42P01' || error.message?.includes('does not exist')) {
      return [];
    }
    console.error('getStaffLocalShifts error:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudieron cargar los turnos del local'));
  }

  return (data || []) as LocalShift[];
}

/**
 * Crea o actualiza un turno en el local actual.
 */
export async function upsertShift(payload: z.infer<typeof ShiftSchema>) {
  const staff = await getStaffContext();
  const validated = parseOrThrow(ShiftSchema, payload);

  const openM = timeToMinutes(validated.open_time);
  const closeM = timeToMinutes(validated.close_time);
  if (openM >= closeM) {
    throw new AppError('La hora de inicio debe ser anterior a la hora de fin del turno');
  }

  const supabase = createServerClient();
  const shiftRecord = {
    ...validated,
    location_id: staff.location_id,
  };

  const data = await queryOrThrow(
    supabase
      .from('local_shifts')
      .upsert(shiftRecord)
      .select('*')
      .single(),
    { action: 'upsertShift', fallback: 'No se pudo guardar el turno' }
  );

  revalidatePath('/staff/admin');
  return data as LocalShift;
}

/**
 * Elimina un turno.
 */
export async function deleteShift(id: string) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('local_shifts')
    .delete()
    .eq('id', id)
    .eq('location_id', staff.location_id);

  if (error) {
    console.error('deleteShift error:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudo eliminar el turno'));
  }

  revalidatePath('/staff/admin');
  return { ok: true };
}

/**
 * Genera las franjas horarias válidas para una fecha dada en un local,
 * considerando todos los turnos activos de ese día de la semana.
 */
export async function getGeneratedSlotsForDate(locationId: string, dateStr: string): Promise<{
  slots: { time: string; turnDurationMinutes: number; bufferMinutes: number }[];
  shifts: LocalShift[];
}> {
  // Obtener día de la semana (0 = Domingo en JS y en nuestro modelo)
  // Formato YYYY-MM-DD interpretado en local para evitar desfase de zona horaria
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dayOfWeek = dateObj.getDay();

  const supabase = createServerClient();
  const { data: shiftsData, error } = await supabase
    .from('local_shifts')
    .select('*')
    .eq('location_id', locationId)
    .eq('day_of_week', dayOfWeek)
    .eq('is_active', true)
    .order('open_time', { ascending: true });

  const shifts = ((!error && shiftsData) ? shiftsData : []) as LocalShift[];

  // Fallback estándar si no hay turnos configurados aún
  if (shifts.length === 0) {
    const defaultSlots = [
      '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
      '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
      '18:00', '18:30', '19:00', '19:30', '20:00', '20:30',
      '21:00', '21:30', '22:00'
    ];
    return {
      slots: defaultSlots.map((time) => ({
        time,
        turnDurationMinutes: 90,
        bufferMinutes: 15,
      })),
      shifts: [],
    };
  }

  const generatedSlotsMap = new Map<string, { time: string; turnDurationMinutes: number; bufferMinutes: number }>();

  shifts.forEach((shift) => {
    const startM = timeToMinutes(shift.open_time);
    const endM = timeToMinutes(shift.close_time);
    const interval = shift.slot_interval_minutes || 30;
    const duration = shift.turn_duration_minutes || 90;
    const buffer = shift.buffer_minutes || 15;

    // No generar slots después de (endM - duration) para garantizar que el comensal disfrute su estancia completa
    const latestStart = Math.max(startM, endM - duration);

    for (let cur = startM; cur <= latestStart; cur += interval) {
      const timeStr = minutesToTime(cur);
      if (!generatedSlotsMap.has(timeStr)) {
        generatedSlotsMap.set(timeStr, {
          time: timeStr,
          turnDurationMinutes: duration,
          bufferMinutes: buffer,
        });
      }
    }
  });

  const slots = Array.from(generatedSlotsMap.values()).sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  return { slots, shifts };
}
