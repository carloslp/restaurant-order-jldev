// Utilidades de servidor: resolución del local por subdominio y helpers de GUC.

import { createAnonServerClient } from '@/lib/supabase/server';

export interface LocalInfo {
  id: string;
  name: string;
  subdomain: string;
  timezone: string;
  iva_rate: number;
  delivery_fee: number;
}

/** Resuelve el local a partir del host (subdominio). */
export async function getLocalByHost(host: string | null | undefined): Promise<LocalInfo | null> {
  if (!host) return null;
  const subdomain = host.split(':')[0].split('.')[0].toLowerCase(); // ej. "milocal.localhost" -> "milocal"
  if (!subdomain) return null;

  const supabase = createAnonServerClient();
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

/** Obtiene el local por su ID (para server actions que ya conocen el id). */
export async function getLocalById(id: string): Promise<LocalInfo | null> {
  const supabase = createAnonServerClient();
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