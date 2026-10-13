// Utilidades de servidor: resolución del local por slug (path) y helpers de GUC.
// Las locations se manejan por PATH, no por subdominio: {dominio}/{slug-de-sucursal}.
// El dominio es irrelevante para la app (cada restaurante tiene su propio dominio
// y su propio deployment/DB); no se lee ningún header de host.

import { createServerClient } from '@/lib/supabase/server';

export interface LocalInfo {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  iva_rate: number;
  delivery_fee: number;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_open?: boolean;
  is_catalog_only?: boolean;
  reservations_enabled?: boolean;
}

export interface LocalSummary {
  id: string;
  name: string;
  slug: string;
}

export function toLocalInfo(data: Record<string, unknown>): LocalInfo {
  return {
    id: data.id as string,
    name: data.name as string,
    slug: data.slug as string,
    timezone: data.timezone as string,
    iva_rate: Number(data.iva_rate),
    delivery_fee: Number(data.delivery_fee ?? 0),
    address: (data.address as string | undefined) ?? null,
    latitude: data.latitude != null ? Number(data.latitude) : null,
    longitude: data.longitude != null ? Number(data.longitude) : null,
    is_open: data.is_open !== false,
    is_catalog_only: Boolean(data.is_catalog_only),
    reservations_enabled: data.reservations_enabled !== false,
  };
}

import { unstable_cache } from 'next/cache';

const LOCAL_COLUMNS = 'id, name, slug, timezone, iva_rate, delivery_fee, address, latitude, longitude, is_open, is_catalog_only, reservations_enabled';

async function fetchLocalBySlugFromDb(normalizedSlug: string): Promise<LocalInfo | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('locals')
    .select(LOCAL_COLUMNS)
    .eq('slug', normalizedSlug)
    .maybeSingle();

  if (error || !data) return null;
  return toLocalInfo(data);
}

/**
 * Resuelve el local a partir del slug del path (ej: `/centro` → 'centro').
 * Envuelta en unstable_cache con tag `local-${slug}` para eliminar consultas repetitivas a Supabase.
 */
export async function getLocalBySlug(slug: string | null | undefined): Promise<LocalInfo | null> {
  const normalized = slug?.trim().toLowerCase();
  if (!normalized) return null;

  const getCached = unstable_cache(
    async (s: string) => fetchLocalBySlugFromDb(s),
    ['local-by-slug', normalized],
    {
      revalidate: 300,
      tags: [`local-${normalized}`],
    }
  );
  return getCached(normalized);
}

async function fetchLocalByIdFromDb(id: string): Promise<LocalInfo | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('locals')
    .select(LOCAL_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (!data) return null;
  return toLocalInfo(data);
}

/** Obtiene el local por su ID (para revalidar server-side en el checkout). */
export async function getLocalById(id: string): Promise<LocalInfo | null> {
  if (!id) return null;
  const getCached = unstable_cache(
    async (localId: string) => fetchLocalByIdFromDb(localId),
    ['local-by-id', id],
    {
      revalidate: 300,
      tags: [`local-id-${id}`],
    }
  );
  return getCached(id);
}

async function fetchLocalSummariesFromDb(): Promise<LocalSummary[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('locals')
    .select('id, name, slug')
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return data as LocalSummary[];
}

/** Lista pública mínima de locales (para el índice `/`). */
export const listLocalSummaries = unstable_cache(
  fetchLocalSummariesFromDb,
  ['local-summaries'],
  {
    revalidate: 300,
    tags: ['locals-list'],
  }
);