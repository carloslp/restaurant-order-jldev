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
}

export interface LocalSummary {
  id: string;
  name: string;
  slug: string;
}

function toLocalInfo(data: Record<string, unknown>): LocalInfo {
  return {
    id: data.id as string,
    name: data.name as string,
    slug: data.slug as string,
    timezone: data.timezone as string,
    iva_rate: Number(data.iva_rate),
    delivery_fee: Number(data.delivery_fee ?? 0),
  };
}

/**
 * Resuelve el local a partir del slug del path (ej: `/centro` → 'centro').
 * NOTA: lee `locals` con service role porque la política RLS oculta la tabla al rol anon
 * (el público no debe enumerar locales). El slug es un identificador público del path,
 * no un dato sensible; el service role es seguro en el servidor.
 */
export async function getLocalBySlug(slug: string | null | undefined): Promise<LocalInfo | null> {
  const normalized = slug?.trim().toLowerCase();
  if (!normalized) return null;

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('locals')
    .select('*')
    .eq('slug', normalized)
    .maybeSingle();

  if (error || !data) return null;
  return toLocalInfo(data);
}

/** Obtiene el local por su ID (para revalidar server-side en el checkout). */
export async function getLocalById(id: string): Promise<LocalInfo | null> {
  const supabase = createServerClient();
  const { data } = await supabase.from('locals').select('*').eq('id', id).maybeSingle();
  if (!data) return null;
  return toLocalInfo(data);
}

/** Lista pública mínima de locales (para el índice `/`). */
export async function listLocalSummaries(): Promise<LocalSummary[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('locals')
    .select('id, name, slug')
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return data as LocalSummary[];
}