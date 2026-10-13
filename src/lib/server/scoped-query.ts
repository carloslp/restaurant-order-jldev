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
  return {
    select: (columns = '*') =>
      supabase.from(table).select(columns).eq('location_id', locationId),
    update: (values: Record<string, unknown>) =>
      supabase.from(table).update(values).eq('location_id', locationId),
    delete: () =>
      supabase.from(table).delete().eq('location_id', locationId),
    insert: (values: Record<string, unknown> | Record<string, unknown>[]) =>
      supabase.from(table).insert(
        Array.isArray(values)
          ? values.map((v) => ({ ...v, location_id: locationId }))
          : { ...values, location_id: locationId }
      ),
  };
}
