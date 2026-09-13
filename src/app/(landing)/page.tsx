import { headers } from 'next/headers';
import { getLocalByHost } from '@/lib/server/local';
import { getMenu } from '@/features/menu/queries';
import { getAllergensAndDietLabels } from '@/features/menu/allergens';
import type { Category, Product } from '@/lib/types';
import MenuClient from './MenuClient';

export default async function LandingPage() {
  // El host (subdominio) se resuelve en runtime; sin env vars cae a placeholder.
  let local = null;
  let menu: { categories: Category[]; products: Product[] } = { categories: [], products: [] };
  let allergens: string[] = [];
  let dietLabels: string[] = [];

  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const host = (await headers()).get('host');
    local = await getLocalByHost(host);
    if (local) {
      try {
        menu = await getMenu(local.id);
      } catch {
        menu = { categories: [], products: [] };
      }
    }
    try {
      ({ allergens, dietLabels } = await getAllergensAndDietLabels());
    } catch {
      // sin datos maestros aún
    }
  }

  return (
    <MenuClient
      local={local}
      categories={menu.categories}
      products={menu.products}
      allergens={allergens}
      dietLabels={dietLabels}
    />
  );
}