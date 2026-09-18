/**
 * Cliente Supabase con cookies para auth de staff.
 * SOLO para Server Components, Route Handlers y Server Actions.
 * El refresh automático renueva la sesión y persiste en cookies httpOnly.
 */

import { createServerClient as createSsrServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createSessionServerClient() {
  const cookieStore = await cookies();

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Faltan SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY (o ANON)');
  }

  return createSsrServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component: safe to ignore when setting cookies
          // on a response (the middleware will refresh the session).
        }
      },
    },
  });
}