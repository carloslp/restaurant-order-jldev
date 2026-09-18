// src/lib/server/reservations.ts
'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getCurrentStaff } from '@/app/staff/page';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import type { ReservationStatus, Zone } from '@/lib/types';

// --- Schemas ---
const ReservationSchema = z.object({
  holder_name: z.string().min(1, 'El nombre es requerido'),
  holder_phone: z.string().min(5, 'El teléfono es requerido'),
  reservation_date: z.string(), // ISO date string (YYYY-MM-DD)
  reservation_time: z.string(), // HH:mm format
  party_size: z.number().int().positive('El tamaño del grupo debe ser mayor a 0'),
  preferred_zone: z.enum(['INTERIOR', 'TERRAZA', 'BARRA']),
  status: z.enum(['PENDIENTE', 'CONFIRMADA', 'CANCELADA', 'NO_SHOW']).default('PENDIENTE'),
  deposit_status: z.enum(['SIN_DEPOSITO', 'DEPOSITO_PENDIENTE', 'DEPOSITADO']).default('SIN_DEPOSITO'),
  notes: z.string().nullish(),
});

async function getStaffContext() {
  const { staff } = await getCurrentStaff();
  return staff;
}

// --- Zone Capacity ---

export async function getZoneCapacities() {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('local_zone_capacity')
    .select('zone, capacity')
    .eq('location_id', staff.location_id);

  if (error) throw error;
  return data || [];
}

// --- Reservations ---

export async function listReservations(startDate: string, endDate: string) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  await supabase.rpc('set_config', {
    name: 'app.local_id',
    value: staff.location_id,
    is_local: true,
  });

  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .gte('reservation_date', startDate)
    .lte('reservation_date', endDate)
    .order('reservation_date', { ascending: true })
    .order('reservation_time', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createReservation(payload: z.infer<typeof ReservationSchema>) {
  const staff = await getStaffContext();
  const validated = ReservationSchema.parse(payload);
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('reservations')
    .insert({
      ...validated,
      location_id: staff.location_id,
      created_by: staff.id,
    })
    .select()
    .single();

  if (error) throw error;

  revalidatePath('/staff/admin');
  return data;
}

export async function updateReservation(id: string, payload: Partial<z.infer<typeof ReservationSchema>>) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  // Verify ownership
  const { data: res } = await supabase
    .from('reservations')
    .select('id')
    .eq('id', id)
    .eq('location_id', staff.location_id)
    .single();

  if (!res) throw new Error('Reserva no encontrada o no autorizada');

  const { data, error } = await supabase
    .from('reservations')
    .update({
      ...payload,
      updated_by: staff.id,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

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

  if (error) throw error;

  revalidatePath('/staff/admin');
  return { ok: true };
}

export async function changeReservationStatus(id: string, status: ReservationStatus) {
  return updateReservation(id, { status });
}
