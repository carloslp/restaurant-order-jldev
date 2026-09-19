// Server actions para recuperación de contraseña de staff.
// Flujo:
//  1) requestPasswordReset: envía email de recovery (Supabase Auth) con redirect
//     al callback existente, que intercambia el code y crea sesión, y luego
//     continúa a /recuperar/nueva.
//  2) updatePasswordAction: con la sesión de recovery activa, actualiza la
//     contraseña y redirige al panel.

'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSessionServerClient } from '@/lib/supabase/session';

export async function requestPasswordReset(
  _prevState: { error?: string; success?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: 'Ingresá un email válido.' };
  }

  const supabase = await createSessionServerClient();
  const headerStore = await headers();
  const origin =
    headerStore.get('origin') ?? `http://localhost:${process.env.PORT ?? 3000}`;

  // El callback intercambia el code por sesión y continúa a ?next=
  const redirectTo = `${origin}/staff/auth/callback?next=${encodeURIComponent('/recuperar/nueva')}`;

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  if (error) {
    console.error('Error enviando email de recuperación:', error);
    // Mensaje genérico: no revelar si el email existe o no
    return {
      success: true,
    };
  }

  // Siempre éxito (no filtrar existencia de cuentas)
  return { success: true };
}

export async function updatePasswordAction(
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string } | null> {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (!password || password.length < 8) {
    return { error: 'La contraseña debe tener al menos 8 caracteres.' };
  }
  if (password.length > 72) {
    return { error: 'Máximo 72 caracteres.' };
  }
  if (password !== confirm) {
    return { error: 'Las contraseñas no coinciden.' };
  }

  const supabase = await createSessionServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?error=recovery_expired');
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    console.error('Error actualizando contraseña:', error);
    return { error: 'No se pudo actualizar la contraseña. Intentá de nuevo.' };
  }

  // Sesión de recovery sigue activa → al panel
  redirect('/staff');
  return null; // inalcanzable: redirect() lanza y corta el flujo
}