// Alérgenos y etiquetas dietarias (server). Datos estáticos de la BD.

'use server';

import { createAnonServerClient } from '@/lib/supabase/server';

export async function getAllergensAndDietLabels(): Promise<{
  allergens: string[];
  dietLabels: string[];
}> {
  const supabase = createAnonServerClient();
  const [a, d] = await Promise.all([
    supabase.from('allergens').select('name'),
    supabase.from('diet_labels').select('name'),
  ]);
  return {
    allergens: (a.data ?? []).map((x) => x.name as string),
    dietLabels: (d.data ?? []).map((x) => x.name as string),
  };
}