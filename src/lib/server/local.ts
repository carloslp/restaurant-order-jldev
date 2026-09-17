// Utilidades de servidor: resolución del local por subdominio y helpers de GUC.

import { createServerClient } from '@/lib/supabase/server';

export interface LocalInfo {
  id: string;
  name: string;
  subdomain: string;
  timezone: string;
  iva_rate: number;
  delivery_fee: number;
}

/**
 * Resuelve el local a partir del host (subdominio).
 * NOTA: lee `locals` con service role porque la política RLS oculta la tabla al rol anon
 * (el público no debe enumerar locales). El subdominio es un identificador público del dominio,
 * no un dato sensible; el service role es seguro en el servidor.
 */
export async function getLocalByHost(host: string | null | undefined): Promise<LocalInfo | null> {
  if (!host) return null;
  const subdomain = host.split(':')[0].split('.')[0].toLowerCase();
  if (!subdomain) return null;

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('locals')
    .select('*')
    .eq('subdomain', subdomain)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id,
    name: data.name,
    subdomain: data.subdomain,
    timezone: data.timezone,
    iva_rate: Number(data.iva_rate),
    delivery_fee: Number(data.delivery_fee ?? 0),
  };
}

/** Obtiene el local por su ID. */
export async function getLocalById(id: string): Promise<LocalInfo | null> {
  const supabase = createServerClient();
  const { data } = await supabase.from('locals').select('*').eq('id', id).maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    subdomain: data.subdomain,
    timezone: data.timezone,
    iva_rate: Number(data.iva_rate),
    delivery_fee: Number(data.delivery_fee ?? 0),
  };
}