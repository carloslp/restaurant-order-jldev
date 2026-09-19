'use server';

import { createServerClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { locationSlugSchema } from '@/lib/slugs';

// --- Schemas ---

const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(72, 'Máximo 72 caracteres');

const SetupSchema = z
  .object({
    localName: z.string().min(1, 'El nombre del local es requerido'),
    slug: locationSlugSchema,
    adminEmail: z.string().email('Email inválido'),
    adminName: z.string().min(1, 'El nombre es requerido'),
    adminPassword: passwordSchema,
    adminPasswordConfirm: z.string(),
    timezone: z.string().default('America/Mexico_City'),
    iva_rate: z.number().min(0).max(1).default(0.16),
    delivery_fee: z.number().min(0).default(0),
  })
  .refine((data) => data.adminPassword === data.adminPasswordConfirm, {
    message: 'Las contraseñas no coinciden',
    path: ['adminPasswordConfirm'],
  });

// --- Server Action ---

export async function initializeSystem(payload: z.infer<typeof SetupSchema>) {
  const validated = SetupSchema.parse(payload);
  const supabase = createServerClient();

  // 1. Verificar que no existan locales ya (evitar re-inicialización)
  const { data: existingLocals, error: checkError } = await supabase
    .from('locals')
    .select('id')
    .limit(1);

  if (checkError) throw checkError;

  if (existingLocals && existingLocals.length > 0) {
    throw new Error('El sistema ya está inicializado. Hay locales existentes.');
  }

  // 2. Crear el local
  const { data: local, error: localError } = await supabase
    .from('locals')
    .insert({
      name: validated.localName,
      slug: validated.slug,
      timezone: validated.timezone,
      iva_rate: validated.iva_rate,
      delivery_fee: validated.delivery_fee,
    })
    .select()
    .single();

  if (localError) throw localError;

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

  if (staffError) {
    // Rollback: eliminar local si falla staff
    await supabase.from('locals').delete().eq('id', local.id);
    throw staffError;
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
      throw new Error('Ese email ya está registrado. Usa otro o recupera la contraseña desde /recuperar.');
    }
    throw new Error(`Error creando el usuario: ${authError.message}`);
  }

  // 5. Vincular auth_user_id al registro staff (directo, el usuario ya existe)
  const { error: linkError } = await supabase
    .from('staff')
    .update({ auth_user_id: authData.user?.id })
    .eq('id', staff.id);

  if (linkError) {
    console.error('Error vinculando auth_user_id:', linkError);
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

  if (error) throw error;
  return (data ?? []).length > 0;
}