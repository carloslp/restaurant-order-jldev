// src/features/staff/auth.ts
'use server';

import { createSessionServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

export async function signInWithMagicLink(prevState: { error?: string } | null, formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: 'Ingresá un email válido.' };
  }

  const supabase = await createSessionServerClient();
  const headerStore = await headers();
  const origin = headerStore.get('origin') ?? `http://localhost:${process.env.PORT ?? 3000}`;
  const redirectTo = `${origin}/staff/auth/callback`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: false, // solo staff existente
    },
  });

  if (error) {
    console.error('Error enviando magic link:', error);
    return {
      error:
        error.code === 'user_not_found'
          ? 'Este email no tiene acceso al staff.'
          : 'No se pudo enviar el link. Intentá de nuevo.',
    };
  }

  redirect(`${origin}/login?sent=1`);
}

export async function signOut() {
  const supabase = await createSessionServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}