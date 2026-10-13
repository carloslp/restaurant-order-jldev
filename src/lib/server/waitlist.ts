// src/lib/server/waitlist.ts
'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getCurrentStaff } from '@/app/staff/page';
import { getLocalBySlug } from '@/lib/server/local';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { AppError, parseOrThrow, parsePostgrestError } from '@/lib/errors';
import { zNumberES, isValidPhone } from '@/lib/validation';
import type { 
  WaitlistParty, 
  WaitlistStatus, 
  WaitlistZonePreference, 
  JoinWaitlistInput,
  PublicWaitlistStatusResponse,
  RestaurantTable
} from '@/lib/types';

// Esquemas de validación
const JoinWaitlistSchema = z.object({
  location_slug: z.string().min(1, 'Sucursal no especificada'),
  customer_name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  customer_phone: z.string().refine(isValidPhone, 'Ingresa un teléfono válido (8 a 16 dígitos)'),
  party_size: zNumberES('El número de comensales debe ser un número')
    .int('Debe ser un número entero')
    .min(1, 'Mínimo 1 comensal')
    .max(30, 'Para grupos mayores a 30 personas, contacta al restaurante directamente'),
  preferred_zone: z.enum(['INTERIOR', 'TERRAZA', 'BARRA', 'CUALQUIERA'], {
    message: 'Elige una preferencia de zona válida',
  }),
  notes: z.string().max(300, 'Las notas no pueden exceder 300 caracteres').nullish(),
});

async function getStaffContext() {
  const { staff } = await getCurrentStaff();
  return staff;
}

// ---------------------------------------------------------------------------
// 1. FUNCIONES PÚBLICAS (CLIENTE EN PUERTA)
// ---------------------------------------------------------------------------

/**
 * Registra a un comensal presencial en la fila de espera virtual.
 */
export async function joinPublicWaitlist(payload: JoinWaitlistInput): Promise<{
  ok: boolean;
  trackingToken?: string;
  position?: number;
  estimatedMinutes?: number;
  error?: string;
}> {
  try {
    const validated = parseOrThrow(JoinWaitlistSchema, payload);
    const local = await getLocalBySlug(validated.location_slug);
    if (!local) {
      return { ok: false, error: 'Sucursal no encontrada' };
    }

    const supabase = createServerClient();

    // Contar cuántos grupos están en espera en este momento para estimar posición y tiempo
    const { count: currentWaiting } = await supabase
      .from('waitlist')
      .select('id', { count: 'exact', head: true })
      .eq('location_id', local.id)
      .in('status', ['EN_ESPERA', 'LLAMADO']);

    const position = (currentWaiting || 0) + 1;
    // Estimación: 10 a 15 minutos por mesa delante
    const estimatedMinutes = Math.max(5, position * 10);
    const trackingToken = crypto.randomUUID();

    const { data, error } = await supabase
      .from('waitlist')
      .insert({
        location_id: local.id,
        customer_name: validated.customer_name.trim(),
        customer_phone: validated.customer_phone.trim(),
        party_size: validated.party_size,
        preferred_zone: validated.preferred_zone,
        status: 'EN_ESPERA',
        tracking_token: trackingToken,
        estimated_wait_minutes: estimatedMinutes,
        notes: validated.notes?.trim() || null,
      })
      .select('id, tracking_token')
      .single();

    if (error) {
      console.error('joinPublicWaitlist error:', error);
      return { ok: false, error: parsePostgrestError(error, 'No se pudo registrar en la fila de espera.') };
    }

    revalidatePath('/staff/admin');
    revalidatePath(`/${validated.location_slug}/fila`);

    return {
      ok: true,
      trackingToken: data.tracking_token,
      position,
      estimatedMinutes,
    };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Error al unirse a la fila' };
  }
}

/**
 * Consulta en tiempo real el estado y lugar de un cliente mediante su tracking_token.
 */
export async function getWaitlistStatusByToken(token: string): Promise<PublicWaitlistStatusResponse> {
  try {
    if (!token) return { ok: false, error: 'Token inválido' };

    const supabase = createServerClient();

    // 1. Obtener la entrada del cliente
    const { data: party, error } = await supabase
      .from('waitlist')
      .select('*, locals(name), restaurant_tables(table_number)')
      .eq('tracking_token', token)
      .single();

    if (error || !party) {
      return { ok: false, error: 'Turno en fila no encontrado o ya expirado.' };
    }

    // 2. Si sigue en espera, calcular su posición ordinal respecto a los creados antes
    let position = 1;
    let totalWaiting = 1;

    if (party.status === 'EN_ESPERA') {
      const { data: ahead } = await supabase
        .from('waitlist')
        .select('id')
        .eq('location_id', party.location_id)
        .eq('status', 'EN_ESPERA')
        .lt('created_at', party.created_at);

      position = (ahead?.length || 0) + 1;

      const { count: total } = await supabase
        .from('waitlist')
        .select('id', { count: 'exact', head: true })
        .eq('location_id', party.location_id)
        .in('status', ['EN_ESPERA', 'LLAMADO']);

      totalWaiting = total || 1;
    }

    const estimatedMinutes = Math.max(5, position * 10);

    let displayTableNumber = (party.restaurant_tables as any)?.table_number || party.table_number || null;
    let tableNumbersList: string[] = [];

    if (Array.isArray(party.table_ids) && party.table_ids.length > 0) {
      const { data: linkedTables } = await supabase
        .from('restaurant_tables')
        .select('table_number')
        .in('id', party.table_ids);
      if (linkedTables && linkedTables.length > 0) {
        tableNumbersList = linkedTables.map((t: any) => t.table_number);
        displayTableNumber = tableNumbersList.join(', ');
      }
    } else if (displayTableNumber) {
      tableNumbersList = [displayTableNumber];
    }

    return {
      ok: true,
      localName: (party.locals as any)?.name || 'Restaurante',
      party: {
        id: party.id,
        customer_name: party.customer_name,
        party_size: party.party_size,
        preferred_zone: party.preferred_zone,
        status: party.status,
        position,
        totalWaiting,
        estimatedMinutes,
        called_at: party.called_at,
        seated_at: party.seated_at,
        table_number: displayTableNumber,
        table_numbers: tableNumbersList,
        created_at: party.created_at,
      },
    };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Error al consultar turno' };
  }
}

/**
 * Permite al comensal cancelar voluntariamente su turno desde su teléfono.
 */
export async function cancelPublicWaitlistByToken(token: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from('waitlist')
      .update({
        status: 'CANCELADO',
        updated_at: new Date().toISOString(),
      })
      .eq('tracking_token', token);

    if (error) {
      return { ok: false, error: parsePostgrestError(error, 'No se pudo cancelar el turno.') };
    }

    revalidatePath('/staff/admin');
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Error al cancelar' };
  }
}

// ---------------------------------------------------------------------------
// 2. FUNCIONES DE ADMINISTRACIÓN (STAFF / HOSTESS)
// ---------------------------------------------------------------------------

const WAITLIST_PARTY_COLUMNS =
  'id, location_id, customer_name, customer_phone, party_size, preferred_zone, status, tracking_token, notes, called_at, seated_at, table_id, created_at, updated_at';

/**
 * Lista las personas actualmente activas en la fila de espera del local.
 */
export async function listActiveWaitlist(): Promise<WaitlistParty[]> {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  const [{ data: waitlistData, error }, { data: tablesData }] = await Promise.all([
    supabase
      .from('waitlist')
      .select(WAITLIST_PARTY_COLUMNS)
      .eq('location_id', staff.location_id)
      .in('status', ['EN_ESPERA', 'LLAMADO'])
      .order('created_at', { ascending: true }),
    supabase
      .from('restaurant_tables')
      .select('id, table_number')
      .eq('location_id', staff.location_id),
  ]);

  if (error) {
    console.error('listActiveWaitlist error:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudo cargar la fila de espera.'));
  }

  const tableMap = new Map<string, string>();
  (tablesData || []).forEach((t: any) => tableMap.set(t.id, t.table_number));

  return (waitlistData || []).map((p: any) => {
    const rawIds: string[] = Array.isArray(p.table_ids) && p.table_ids.length > 0 
      ? p.table_ids 
      : p.table_id ? [p.table_id] : [];
    
    const tableNumbers = rawIds.map((id) => tableMap.get(id)).filter(Boolean) as string[];
    const displayTableNumber = tableNumbers.length > 0 
      ? tableNumbers.join(', ') 
      : null;

    return {
      ...p,
      table_ids: rawIds,
      table_number: displayTableNumber,
      table_numbers: tableNumbers,
    };
  }) as WaitlistParty[];
}

/**
 * Notifica / llama a un grupo de la fila para que se acerque a la entrada.
 */
export async function callWaitlistParty(id: string): Promise<{ ok: boolean; error?: string }> {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('waitlist')
    .update({
      status: 'LLAMADO',
      called_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: staff.id,
    })
    .eq('id', id)
    .eq('location_id', staff.location_id);

  if (error) {
    console.error('callWaitlistParty error:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudo llamar al comensal.'));
  }

  revalidatePath('/staff/admin');
  return { ok: true };
}

/**
 * Sienta al comensal de la fila en una o múltiples mesas físicas del restaurante.
 * El mesero/hostess escoge las mesas contiguas.
 * Marca todas las mesas seleccionadas como OCUPADA y el turno en la fila como SENTADO.
 */
export async function seatWaitlistParty(
  waitlistId: string, 
  tableIds: string | string[]
): Promise<{ ok: boolean; error?: string }> {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  const ids = (Array.isArray(tableIds) ? tableIds : [tableIds]).filter(Boolean);
  if (ids.length === 0) {
    throw new AppError('Debes seleccionar al menos una mesa física para sentar al grupo.');
  }

  // 1. Obtener la entrada de fila
  const { data: party, error: pErr } = await supabase
    .from('waitlist')
    .select('id, party_size, customer_name')
    .eq('id', waitlistId)
    .eq('location_id', staff.location_id)
    .single();

  if (pErr || !party) {
    throw new AppError('Comensal en fila no encontrado.');
  }

  // 2. Ocupar todas las mesas físicas seleccionadas por el mesero
  const perTableGuests = Math.ceil(party.party_size / ids.length);
  const { error: tErr } = await supabase
    .from('restaurant_tables')
    .update({
      status: 'OCUPADA',
      current_guests: perTableGuests,
      updated_at: new Date().toISOString(),
    })
    .in('id', ids)
    .eq('location_id', staff.location_id);

  if (tErr) {
    console.error('seatWaitlistParty/table error:', tErr);
    throw new AppError(parsePostgrestError(tErr, 'No se pudieron ocupar las mesas seleccionadas.'));
  }

  // 3. Actualizar la entrada de fila a SENTADO con table_id (principal) y table_ids (todas)
  const { error: wErr } = await supabase
    .from('waitlist')
    .update({
      status: 'SENTADO',
      table_id: ids[0],
      table_ids: ids,
      seated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: staff.id,
    })
    .eq('id', waitlistId);

  if (wErr) {
    console.error('seatWaitlistParty/waitlist error:', wErr);
    throw new AppError(parsePostgrestError(wErr, 'No se pudo registrar como sentado.'));
  }

  revalidatePath('/staff/admin');
  return { ok: true };
}

/**
 * Cancela o marca como no-show a un grupo en la fila.
 */
export async function updateWaitlistStatus(
  id: string, 
  status: WaitlistStatus
): Promise<{ ok: boolean; error?: string }> {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('waitlist')
    .update({
      status,
      updated_at: new Date().toISOString(),
      updated_by: staff.id,
    })
    .eq('id', id)
    .eq('location_id', staff.location_id);

  if (error) {
    console.error('updateWaitlistStatus error:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudo actualizar el estado de la fila.'));
  }

  revalidatePath('/staff/admin');
  return { ok: true };
}

/**
 * Agrega manualmente a un comensal a la fila desde el panel de Hostess (ej. comensal sin smartphone).
 */
export async function addManualWaitlist(input: {
  customer_name: string;
  customer_phone: string;
  party_size: number;
  preferred_zone: WaitlistZonePreference;
  notes?: string;
}): Promise<{ ok: boolean; waitlist?: WaitlistParty; error?: string }> {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('waitlist')
    .insert({
      location_id: staff.location_id,
      customer_name: input.customer_name.trim(),
      customer_phone: input.customer_phone.trim(),
      party_size: input.party_size,
      preferred_zone: input.preferred_zone,
      status: 'EN_ESPERA',
      tracking_token: crypto.randomUUID(),
      notes: input.notes?.trim() || null,
      created_by: staff.id,
    })
    .select(WAITLIST_PARTY_COLUMNS)
    .single();

  if (error) {
    console.error('addManualWaitlist error:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudo registrar a la persona en la fila.'));
  }

  revalidatePath('/staff/admin');
  return { ok: true, waitlist: data as WaitlistParty };
}
