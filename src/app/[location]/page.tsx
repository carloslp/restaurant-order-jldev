// Menú público de una location (sucursal) — resuelto por PATH: /{location}.
// El dominio es irrelevante; el primer segmento de la ruta identifica la sucursal.
import { notFound } from 'next/navigation';
import { getLocalBySlug } from '@/lib/server/local';
import { getMenu } from '@/features/menu/queries';
import { getAllergensAndDietLabels } from '@/features/menu/allergens';
import type { Category, Product } from '@/lib/types';
import MenuClient from './MenuClient';

export const dynamic = 'force-dynamic';

export default async function LocationMenuPage({
  params,
}: {
  params: Promise<{ location: string }>;
}) {
  const { location: slug } = await params;

  let local = null;
  let menu: { categories: Category[]; products: Product[] } = { categories: [], products: [] };
  let allergens: string[] = [];
  let dietLabels: string[] = [];

  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    local = await getLocalBySlug(slug);
    if (!local) notFound();
    try {
      menu = await getMenu(local.id);
    } catch {
      menu = { categories: [], products: [] };
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
      locationId={local?.id ?? ''}
      categories={menu.categories}
      products={menu.products}
      allergens={allergens}
      dietLabels={dietLabels}
      searchTerm=""
    />
  );
}