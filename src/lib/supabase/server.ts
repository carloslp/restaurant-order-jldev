// Clientes Supabase del lado servidor (Node runtime).
// - createServerClient(): operaciones con secret key (salta RLS) — NUNCA exponer al cliente.
// - createAnonServerClient(): consultas públicas (menú), respeta RLS.
// - createSessionServerClient(): cliente auth con cookies (para paneles de staff, magic link).

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServerClient as createSsrServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createServerClient() {
  const url = process.env.SUPABASE_URL;
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secretKey) {
    throw new Error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY (o SERVICE_ROLE_KEY) en el entorno');
  }
  return createSupabaseClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createAnonServerClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Faltan SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY (o ANON)');
  }
  return createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Cliente con cookies para auth de staff.
 * Debe usarse en Server Components, Route Handlers y Server Actions
 * que necesiten leer la sesión autenticada (magic link).
 * El refresh automático renueva la sesión y persiste en cookies httpOnly.
 */
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