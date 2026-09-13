// Clientes Supabase del lado servidor (Node runtime).
// - createServerClient(): operaciones con secret key (salta RLS) — NUNCA exponer al cliente.
// - createAnonServerClient(): consultas públicas (menú), respeta RLS.

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

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