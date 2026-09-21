// src/app/staff/login/page.tsx
import { redirect } from 'next/navigation';
import { createSessionServerClient } from '@/lib/supabase/session';
import { SignInForm } from '@/features/staff/SignInForm';

export const dynamic = 'force-dynamic';

// Mensajes legibles para errores recibidos por query (?error=<código>).
// Solo códigos conocidos; cualquier otro valor cae en el mensaje genérico.
const loginErrorMessages: Record<string, string> = {
  // Usuario autenticado sin registro de staff (el alta es manual).
  no_staff:
    'Tu usuario no está registrado como miembro del staff. Pide al administrador que dé de alta tu acceso.',
  // Fallo transitorio al verificar el staff: la sesión NO se cierra; reintentar.
  staff_lookup_failed:
    'No se pudieron verificar tus datos de acceso. Intenta de nuevo en unos segundos.',
  // Callback de magic link falló (staff/auth/callback redirige con error=1);
  // también se usa como fallback para códigos desconocidos.
  '1': 'No se pudo completar el inicio de sesión. Intenta de nuevo.',
};

export default async function StaffLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { error } = await searchParams;
  const errorKey = Array.isArray(error) ? error[0] : error;
  const initialError = errorKey ? (loginErrorMessages[errorKey] ?? loginErrorMessages['1']) : undefined;

  const supabase = await createSessionServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Con sesión activa y sin error que mostrar → directo al portal.
  // Con error, se muestra el formulario y el mensaje (evita bucles de redirect).
  if (user && !initialError) {
    redirect('/staff');
  }

  return <SignInForm initialError={initialError} />;
}