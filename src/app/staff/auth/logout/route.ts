// src/app/staff/auth/logout/route.ts
import { NextResponse } from 'next/server';
import { createSessionServerClient } from '@/lib/supabase/session';

// Cierra la sesión (un route handler sí puede escribir/eliminar cookies de
// sesión, a diferencia de un Server Component) y regresa al login con un
// motivo legible. Se usa cuando un usuario autenticado no tiene registro de
// staff: el alta de staff es manual, el sistema nunca la ejecuta por su cuenta.
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const reason = searchParams.get('reason') ?? 'no_staff';

  const supabase = await createSessionServerClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`);
}