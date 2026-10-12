'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getCurrentStaff } from '@/app/staff/page';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { AppError, parseOrThrow, parsePostgrestError, queryOrThrow, describeSupabaseError } from '@/lib/errors';
import { strongPasswordSchema } from '@/lib/validation';
import { logAudit } from '@/lib/server/audit';

// --- Schemas ---

const StaffSchema = z.object({
  email: z.string().email('Email inválido'),
  full_name: z.string().min(1, 'El nombre es requerido'),
  is_active: z.boolean().default(true),
});

const InviteStaffSchema = z.object({
  email: z.string().email('Email inválido'),
  full_name: z.string().min(1, 'El nombre es requerido'),
  // Opcional: si se provee, debe cumplir política robusta de contraseñas;
  // si viene vacío/undefined, se envía magic link por email.
  password: z
    .union([strongPasswordSchema, z.literal('')])
    .optional(),
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
}>> {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  await setLocationGUC(supabase, staff.location_id);

  const { data, error } = await supabase
    .from('staff')
    .select('id, location_id, email, full_name, is_active, created_at, updated_at, auth_user_id')
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
  }>;
}

export async function createStaff(payload: z.infer<typeof StaffSchema>) {
  const staff = await getStaffContext();
  const validated = parseOrThrow(StaffSchema, payload);
  const supabase = createServerClient();

  // Verificar que el email no existe ya en este local
  const { data: existing } = await supabase
    .from('staff')
    .select('id')
    .eq('email', validated.email)
    .eq('location_id', staff.location_id)
    .maybeSingle();

  if (existing) {
    throw new AppError('Ya existe un miembro del staff con ese email en este local.', {
      fieldErrors: { email: 'Ese email ya está registrado en este local.' },
    });
  }

  const data = await queryOrThrow(
    supabase
      .from('staff')
      .insert({
        email: validated.email,
        full_name: validated.full_name,
        is_active: validated.is_active,
        location_id: staff.location_id,
      })
      .select()
      .single(),
    { action: 'createStaff', fallback: 'No se pudo crear el miembro del staff.' }
  );

  revalidatePath('/staff/admin');
  return data;
}

export async function updateStaff(id: string, payload: z.infer<typeof StaffSchema>) {
  const staff = await getStaffContext();
  const validated = parseOrThrow(StaffSchema, payload);
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
    throw new AppError('Ya existe otro miembro del staff con ese email en este local.', {
      fieldErrors: { email: 'Ese email ya está registrado en este local.' },
    });
  }

  const data = await queryOrThrow(
    supabase
      .from('staff')
      .update({
        email: validated.email,
        full_name: validated.full_name,
        is_active: validated.is_active,
      })
      .eq('id', id)
      .eq('location_id', staff.location_id)
      .select()
      .single(),
    { action: 'updateStaff', fallback: 'No se pudo actualizar el miembro del staff.' }
  );

  revalidatePath('/staff/admin');
  return data;
}

export async function deleteStaff(id: string) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  // No permitir auto-eliminación
  if (id === staff.id) {
    throw new AppError('No puedes eliminarte a ti mismo.');
  }

  const { error } = await supabase
    .from('staff')
    .delete()
    .eq('id', id)
    .eq('location_id', staff.location_id);

  if (error) {
    console.error('deleteStaff:', error);
    throw new AppError(parsePostgrestError(error, 'No se pudo eliminar el miembro del staff.'));
  }

  revalidatePath('/staff/admin');
  logAudit({
    locationId: staff.location_id,
    staffId: staff.id,
    action: 'DELETE_STAFF',
    resourceType: 'staff',
    resourceId: id,
  });
}

export async function toggleStaffActive(id: string, isActive: boolean) {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  // No permitir auto-desactivación
  if (id === staff.id && !isActive) {
    throw new AppError('No puedes desactivarte a ti mismo.');
  }

  const data = await queryOrThrow(
    supabase
      .from('staff')
      .update({ is_active: isActive })
      .eq('id', id)
      .eq('location_id', staff.location_id)
      .select()
      .single(),
    { action: 'toggleStaffActive', fallback: 'No se pudo cambiar el estado del miembro.' }
  );

  revalidatePath('/staff/admin');
  return data;
}

// --- Invitation Flow (Magic Link o Contraseña) ---

export async function inviteStaff(payload: z.infer<typeof InviteStaffSchema>) {
  const staff = await getStaffContext();
  const validated = parseOrThrow(InviteStaffSchema, payload);
  const supabase = createServerClient();

  // Verificar que el email no existe ya en este local
  const { data: existingStaff } = await supabase
    .from('staff')
    .select('id')
    .eq('email', validated.email)
    .eq('location_id', staff.location_id)
    .maybeSingle();

  if (existingStaff) {
    throw new AppError('Ya existe un miembro del staff con ese email en este local.', {
      fieldErrors: { email: 'Ese email ya está registrado en este local.' },
    });
  }

  // 1. Crear registro en staff (sin auth_user_id aún)
  const newStaff = await queryOrThrow(
    supabase
      .from('staff')
      .insert({
        email: validated.email,
        full_name: validated.full_name,
        is_active: true,
        location_id: staff.location_id,
      })
      .select()
      .single(),
    { action: 'inviteStaff/create', fallback: 'No se pudo crear el miembro del staff.' }
  );

  const metadata = {
    location_id: staff.location_id,
    full_name: validated.full_name,
  };

  // 2a. Con contraseña: crear usuario activo de inmediato (sin email)
  if (validated.password) {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: validated.email,
      password: validated.password,
      email_confirm: true,
      user_metadata: metadata,
    });

    if (authError) {
      await supabase.from('staff').delete().eq('id', newStaff.id);
      if (authError.code === 'email_exists' || /already (registered|exists)/i.test(authError.message)) {
        throw new AppError('Ese email ya está registrado. Usa otro o recupera la contraseña desde /recuperar.', {
          fieldErrors: { email: 'Ese email ya está registrado.' },
        });
      }
      console.error('inviteStaff/createUser:', describeSupabaseError(authError));
      throw new AppError('No se pudo crear el acceso. Inténtalo de nuevo.', {
        cause: authError,
      });
    }

    // Vincular auth_user_id al registro staff
    const { error: linkError } = await supabase
      .from('staff')
      .update({ auth_user_id: authData.user?.id })
      .eq('id', newStaff.id);

    if (linkError) {
      console.error('Error vinculando auth_user_id:', linkError);
    }

    revalidatePath('/staff/admin');
    logAudit({
      locationId: staff.location_id,
      staffId: staff.id,
      action: 'INVITE_STAFF_PASSWORD',
      resourceType: 'staff',
      resourceId: newStaff.id,
      metadata: { email: validated.email },
    });
    return { staff: newStaff, authUser: authData.user, mode: 'password' as const };
  }

  // 2b. Sin contraseña: enviar magic link via Supabase Auth Admin API
  const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(validated.email, {
    data: metadata,
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/staff/auth/callback`,
  });

  if (authError) {
    // Si falla el envío, limpiamos el staff creado
    await supabase.from('staff').delete().eq('id', newStaff.id);
    console.error('inviteStaff/invite:', authError);
    throw new AppError('No se pudo enviar la invitación. Verifica el email e inténtalo de nuevo.');
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
  logAudit({
    locationId: staff.location_id,
    staffId: staff.id,
    action: 'INVITE_STAFF_MAGIC_LINK',
    resourceType: 'staff',
    resourceId: newStaff.id,
    metadata: { email: validated.email },
  });
  return { staff: newStaff, authUser: authData.user, mode: 'magic_link' as const };
}