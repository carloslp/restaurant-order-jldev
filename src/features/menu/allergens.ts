// Alérgenos y etiquetas dietarias (server). Datos estáticos de la BD.

'use server';

import { createAnonServerClient } from '@/lib/supabase/server';
import { describeSupabaseError } from '@/lib/errors';
import { unstable_cache } from 'next/cache';

async function fetchMasterLabelsFromDb(): Promise<{
  allergens: string[];
  dietLabels: string[];
}> {
  const supabase = createAnonServerClient();
  const [a, d] = await Promise.all([
    supabase.from('allergens').select('name'),
    supabase.from('diet_labels').select('name'),
  ]);
  if (a.error) {
    console.error('getAllergensAndDietLabels: fallo cargando allergens:', describeSupabaseError(a.error));
  }
  if (d.error) {
    console.error('getAllergensAndDietLabels: fallo cargando diet_labels:', describeSupabaseError(d.error));
  }
  return {
    allergens: (a.data ?? []).map((x) => x.name as string),
    dietLabels: (d.data ?? []).map((x) => x.name as string),
  };
}

export const getAllergensAndDietLabels = unstable_cache(
  fetchMasterLabelsFromDb,
  ['allergens-diet-labels'],
  {
    revalidate: 3600,
    tags: ['master-labels'],
  }
);