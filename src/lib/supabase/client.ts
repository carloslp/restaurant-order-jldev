// Cliente Supabase (browser-safe).
// Soporta ambas nomenclaturas de claves:
//   - moderna: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
//   - clásica: NEXT_PUBLIC_SUPABASE_ANON_KEY

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (o ANON)'
    );
  }
  return createBrowserClient(url, key);
}