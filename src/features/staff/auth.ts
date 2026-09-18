// src/features/staff/auth.ts
'use server';

import { createSessionServerClient } from '@/lib/supabase/session';
import { createServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

export async function signInWithEmailPassword(prevState: { error?: string } | null, formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: 'Ingresá un email válido.' };
  }
  if (!password) {
    return { error: 'Ingresá tu contraseña.' };
  }

  const supabase = await createSessionServerClient();
  const headerStore = await headers();
  const origin = headerStore.get('origin') ?? `http://localhost:${process.env.PORT ?? 3000}`;

  const { error, data } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('Error signing in with email:', error);
    if (error.code === 'invalid_login_credentials') {
      return { error: 'Credenciales inválidas.' };
    }
    return { error: 'Error al iniciar sesión. Intentá de nuevo.' }
  }

  // After successful sign-in, link staff record and enrich user_metadata
  if (data?.session?.user) {
    const adminSupabase = createServerClient();
    const { data: staff } = await adminSupabase
      .from('staff')
      .select('id, location_id, role, full_name, auth_user_id')
      .eq('email', data.session.user.email)
      .single();

    if (staff) {
      // Update user_metadata for JWT claims (used by RLS policies)
      await adminSupabase.auth.admin.updateUserById(
        data.session.user.id,
        { user_metadata: { location_id: staff.location_id, role: staff.role, full_name: staff.full_name } }
      );
      // Link auth_user_id if not already linked
      if (!staff.auth_user_id) {
        await adminSupabase
          .from('staff')
          .update({ auth_user_id: data.session.user.id })
          .eq('id', staff.id);
      }
    }
  }

  redirect(`${origin}/staff`);
}

export async function signOut() {
  const supabase = await createSessionServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}