// src/features/staff/auth.ts
'use server';

import { createSessionServerClient } from '@/lib/supabase/server';
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
  const redirectTo = `${origin}/staff`;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('Error signing in with email:', error);
    if (error.code === 'invalid_login_credentials') {
      return { error: 'Credenciales inválidas.' };
    }
    return { error: 'Error al iniciar sesión. Intentá de nuevo.' };
  }

  redirect(`${origin}/staff`);
}

export async function signOut() {
  const supabase = await createSessionServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}