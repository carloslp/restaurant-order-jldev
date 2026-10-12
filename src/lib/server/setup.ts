'use server';

import { createServerClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { locationSlugSchema } from '@/lib/slugs';
import { AppError, parseOrThrow, parsePostgrestError, queryOrThrow, describeSupabaseError } from '@/lib/errors';
import { zNumberES, strongPasswordSchema } from '@/lib/validation';

// --- Schemas ---

const SetupSchema = z
  .object({
    localName: z.string().min(1, 'El nombre del local es requerido'),
    slug: locationSlugSchema,
    adminEmail: z.string().email('Email inválido'),
    adminName: z.string().min(1, 'El nombre es requerido'),
    adminPassword: strongPasswordSchema,
    adminPasswordConfirm: z.string(),
    timezone: z.string().default('America/Mexico_City'),
    iva_rate: zNumberES('El IVA debe ser un número').min(0, 'El IVA no puede ser negativo').max(1, 'El IVA no puede ser mayor a 1').default(0.16),
    delivery_fee: zNumberES('La tarifa debe ser un número').min(0, 'La tarifa no puede ser negativa').default(0),
    address: z.string().optional().nullable(),
    latitude: z.preprocess((val) => (val === '' || val === null || val === undefined ? null : Number(val)), z.number().optional().nullable()),
    longitude: z.preprocess((val) => (val === '' || val === null || val === undefined ? null : Number(val)), z.number().optional().nullable()),
  })
  .refine((data) => data.adminPassword === data.adminPasswordConfirm, {
    message: 'Las contraseñas no coinciden',
    path: ['adminPasswordConfirm'],
  });

// --- Server Action ---

export async function initializeSystem(payload: z.infer<typeof SetupSchema>) {
  const validated = parseOrThrow(SetupSchema, payload);
  const supabase = createServerClient();

  // 1. Verificar que no existan locales ya (evitar re-inicialización)
  const { data: existingLocals, error: checkError } = await supabase
    .from('locals')
    .select('id')
    .limit(1);

  if (checkError) {
    console.error('initializeSystem/check:', describeSupabaseError(checkError));
    throw new AppError(parsePostgrestError(checkError, 'No se pudo verificar el estado del sistema.'));
  }

  if (existingLocals && existingLocals.length > 0) {
    throw new AppError('El sistema ya está inicializado. Hay locales existentes.');
  }

  // 2. Crear el local
  const local = await queryOrThrow(
    supabase
      .from('locals')
      .insert({
        name: validated.localName,
        slug: validated.slug,
        timezone: validated.timezone,
        iva_rate: validated.iva_rate,
        delivery_fee: validated.delivery_fee,
        address: validated.address ?? null,
        latitude: validated.latitude ?? null,
        longitude: validated.longitude ?? null,
      })
      .select()
      .single(),
    { action: 'initializeSystem/local', fallback: 'No se pudo crear el local. Inténtalo de nuevo.' }
  );

  // 3. Crear staff (primer admin del local)
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .insert({
      email: validated.adminEmail,
      full_name: validated.adminName,
      is_active: true,
      location_id: local.id,
    })
    .select()
    .single();

  if (staffError || !staff) {
    // Rollback: eliminar local si falla staff
    await supabase.from('locals').delete().eq('id', local.id);
    console.error('initializeSystem/staff:', describeSupabaseError(staffError));
    throw new AppError(parsePostgrestError(staffError, 'No se pudo crear el administrador. Inténtalo de nuevo.'));
  }

  // 4. Crear el usuario de Auth con la contraseña elegida (activo de inmediato,
  //    sin depender de magic link). Antes: inviteUserByEmail (requería email).
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: validated.adminEmail,
    password: validated.adminPassword,
    email_confirm: true,
    user_metadata: {
      location_id: local.id,
      full_name: validated.adminName,
    },
  });

  if (authError) {
    // Rollback: eliminar staff y local si falla la creación del usuario
    await supabase.from('staff').delete().eq('id', staff.id);
    await supabase.from('locals').delete().eq('id', local.id);

    if (authError.code === 'email_exists' || /already (registered|exists)/i.test(authError.message)) {
      throw new AppError('Ese email ya está registrado. Usa otro o recupera la contraseña desde /recuperar.', {
        fieldErrors: { adminEmail: 'Ese email ya está registrado.' },
      });
    }
    console.error('initializeSystem/authUser:', describeSupabaseError(authError));
    throw new AppError('No se pudo crear el usuario administrador. Inténtalo de nuevo.', {
      cause: authError,
    });
  }

  // 5. Vincular auth_user_id al registro staff (directo, el usuario ya existe)
  const { error: linkError } = await supabase
    .from('staff')
    .update({ auth_user_id: authData.user?.id })
    .eq('id', staff.id);

  if (linkError) {
    console.error('Error vinculando auth_user_id:', describeSupabaseError(linkError));
    // No fallar aquí: el login por email+password ya funciona; el fallback
    // de getCurrentStaff (búsqueda por email) cubre mientras se re-vincula.
  }

  return { local, staff, authUser: authData.user };
}

// --- Helper: Verificar si el sistema ya está inicializado ---

export async function checkSystemInitialized(): Promise<boolean> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('locals')
    .select('id')
    .limit(1);

  if (error) {
    console.error('checkSystemInitialized:', describeSupabaseError(error));
    throw new AppError(parsePostgrestError(error, 'No se pudo verificar el estado del sistema.'));
  }
  return (data ?? []).length > 0;
}