// src/lib/server/scoped-query.ts
import type { createServerClient } from '@/lib/supabase/server';

type SupabaseServerClient = ReturnType<typeof createServerClient>;

/**
 * Retorna un query builder garantizando el filtrado por location_id.
 * Mitiga el riesgo de fuga cross-tenant al usar el service role client.
 */
export function locationScoped(
  supabase: SupabaseServerClient,
  table: string,
  locationId: string
) {
  if (!locationId) {
    throw new Error(`[Security] locationScoped requiere un locationId válido para la tabla "${table}".`);
  }
  return supabase.from(table).eq('location_id', locationId);
}
