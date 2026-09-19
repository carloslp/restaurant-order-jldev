'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getCurrentStaff } from '@/app/staff/page';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

// --- Schemas ---

const StaffSchema = z.object({
  email: z.string().email('Email inválido'),
  full_name: z.string().min(1, 'El nombre es requerido'),
  is_active: z.boolean().default(true),
});

const InviteStaffSchema = z.object({
  email: z.string().email('Email inválido'),
  full_name: z.string().min(1, 'El nombre es requerido'),
});


// --- Helpers ---

async function getStaffContext() {
  const { staff } = await getCurrentStaff();
  // No role check - any staff can proceed
  return staff;
}

function setLocationGUC(supabase: ReturnType<typeof createServerClient>, locationId: string) {
  return supabase.rpc('set_config', {
    name: 'app.local_id',
    value: locationId,
    is_local: true,
  });
}

// --- Staff Server Actions ---

export async function listStaff(): Promise<Array<{
  id: string;
  location_id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  auth_user_id: string | null;
  created_by: string | null;
  updated_by: string | null;
}>> {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  await setLocationGUC(supabase, staff.location_id);

  const { data, error } = await supabase
    .from('staff')
    .select('id, location_id, email, full_name, is_active, created_at, updated_at, auth_user_id, created_by, updated_by')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Array<{
    id: string;
    location_id: string;
    email: string;
    full_name: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    auth_user_id: string | null;
    created_by: string | null;
    updated_by: string | null;
  }>;
}

export async function createStaff(payload: z.infer<typeof StaffSchema>) {
  const staff = await getStaffContext();
  const validated = StaffSchema.parse(payload);
  const supabase = createServerClient();

  // Verificar que el email no existe ya en este local
  const { data: existing } = await supabase
    .from('staff')
    .select('id')
    .eq('email', validated.email)
    .eq('location_id', staff.location_id)
    .maybeSingle();

  if (existing) {
    throw new Error('Ya existe un miembro del staff con ese email en este local');
  }

  const { data, error } = await supabase
    .from('staff')
    .insert({
      email: validated.email,
      full_name: validated.full_name,
      is_active: validated.is_active,
      location_id: staff.location_id,
      created_by: staff.id,
    })
    .select()
    .single();

  if (error) throw error;

  revalidatePath('/staff/admin');
  return data;
}

export async function updateStaff(id: string, payload: z.infer<typeof StaffSchema>) {
  const staff = await getStaffContext();
  const validated = StaffSchema.parse(payload);
  const supabase = createServerClient();

  // Verificar que el email no exista en otro registro del mismo local
  const { data: existing } = await supabase
    .from('staff')
    .select('id')
    .eq('email', validated.email)
    .eq('location_id', staff.location_id)
    .neq('id', id)
    .maybeSingle();

  if (existing) {
    throw new Error('Ya existe otro miembro del staff con ese email en este local');
  }

  const { data, error } = await supabase
    .from('staff')
    .update({
      email: validated.email,
      full_name: validated.full_name,
      is_active: validated.is_active,
      updated_by: staff.id,
    })
    .eq('id', id)
    .eq('location_id', staff.location_id)
    .select()
    .single();

  if (error) throw error;

  revalidatePath('/staff/admin');
  return data;
}

export async function deleteStaff(id: string) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  // No permitir auto-eliminación
  if (id === staff.id) {
    throw new Error('No puedes eliminarte a ti mismo');
  }

  const { error } = await supabase
    .from('staff')
    .delete()
    .eq('id', id)
    .eq('location_id', staff.location_id);

  if (error) throw error;

  revalidatePath('/staff/admin');
}

export async function toggleStaffActive(id: string, isActive: boolean) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  // No permitir auto-desactivación
  if (id === staff.id && !isActive) {
    throw new Error('No puedes desactivarte a ti mismo');
  }

  const { data, error } = await supabase
    .from('staff')
    .update({ is_active: isActive, updated_by: staff.id })
    .eq('id', id)
    .eq('location_id', staff.location_id)
    .select()
    .single();

  if (error) throw error;

  revalidatePath('/staff/admin');
  return data;
}

// --- Invitation Flow (Magic Link) ---

export async function inviteStaff(payload: z.infer<typeof InviteStaffSchema>) {
  const staff = await getStaffContext();
  const validated = InviteStaffSchema.parse(payload);
  const supabase = createServerClient();

  // Verificar que el email no existe ya en este local
  const { data: existingStaff } = await supabase
    .from('staff')
    .select('id')
    .eq('email', validated.email)
    .eq('location_id', staff.location_id)
    .maybeSingle();

  if (existingStaff) {
    throw new Error('Ya existe un miembro del staff con ese email en este local');
  }

  // 1. Crear registro en staff (sin auth_user_id aún)
  const { data: newStaff, error: staffError } = await supabase
    .from('staff')
    .insert({
      email: validated.email,
      full_name: validated.full_name,
      is_active: true,
      location_id: staff.location_id,
      created_by: staff.id,
    })
    .select()
    .single();

  if (staffError) throw staffError;

  // 2. Enviar magic link via Supabase Auth Admin API
  // Usamos service role para crear/invitar usuario
  const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(validated.email, {
    data: {
      location_id: staff.location_id,
      full_name: validated.full_name,
    },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/staff/auth/callback`,
  });

  if (authError) {
    // Si falla el envío, limpiamos el staff creado
    await supabase.from('staff').delete().eq('id', newStaff.id);
    throw new Error(`Error enviando invitación: ${authError.message}`);
  }

  // 3. Vincular auth_user_id al registro staff
  const { error: linkError } = await supabase
    .from('staff')
    .update({ auth_user_id: authData.user?.id })
    .eq('id', newStaff.id);

  if (linkError) {
    console.error('Error vinculando auth_user_id:', linkError);
    // No fallar aquí, el trigger lo vinculará automáticamente al hacer login
  }

  revalidatePath('/staff/admin');
  return { staff: newStaff, authUser: authData.user };
}