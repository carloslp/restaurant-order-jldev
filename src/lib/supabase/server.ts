// Cliente Supabase del lado servidor (service role).
// - Se usa para operaciones que requieren saltar RLS (insertar pedidos/reservas del checkout
//   público, gestionar staff, tareas internas) — NUNCA expuesto al cliente.
// - Requiere: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// - En Next.js con runtime Node (default en Server Actions / route handlers).

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export function createServerClient() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno');
  }
  return createSupabaseClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/** Cliente anónimo del lado servidor (para consultas públicas del menú, respetando RLS). */
export function createAnonServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  return createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}