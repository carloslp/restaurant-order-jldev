'use server';

import { createServerClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { locationSlugSchema } from '@/lib/slugs';

// --- Schemas ---

const SetupSchema = z.object({
  localName: z.string().min(1, 'El nombre del local es requerido'),
  slug: locationSlugSchema,
  adminEmail: z.string().email('Email inválido'),
  adminName: z.string().min(1, 'El nombre es requerido'),
  timezone: z.string().default('America/Mexico_City'),
  iva_rate: z.number().min(0).max(1).default(0.16),
  delivery_fee: z.number().min(0).default(0),
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

  // 4. Enviar magic link via Supabase Auth Admin API
  const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(validated.adminEmail, {
    data: {
      location_id: local.id,
      full_name: validated.adminName,
    },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/staff/auth/callback`,
  });

  if (authError) {
    // Rollback: eliminar staff y local si falla auth
    await supabase.from('staff').delete().eq('id', staff.id);
    await supabase.from('locals').delete().eq('id', local.id);
    throw new Error(`Error enviando invitación: ${authError.message}`);
  }

  // 5. Vincular auth_user_id al registro staff
  const { error: linkError } = await supabase
    .from('staff')
    .update({ auth_user_id: authData.user?.id })
    .eq('id', staff.id);

  if (linkError) {
    console.error('Error vinculando auth_user_id:', linkError);
    // No fallar aquí, el trigger lo vinculará automáticamente al hacer login
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