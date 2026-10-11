// Checkout de una location — resuelto por PATH: /{location}/checkout.
// Server component: valida el slug contra la DB y pasa el locationId al cliente.
import { notFound, redirect } from 'next/navigation';
import { getLocalBySlug } from '@/lib/server/local';
import CheckoutClient from './CheckoutClient';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ location: string }>;
}) {
  const { location: slug } = await params;

  let local = null;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    local = await getLocalBySlug(slug);
  }
  if (!local) notFound();

  // Si el local está en modo catálogo (solo visualización), no se permite checkout
  if (local.is_catalog_only) {
    redirect(`/${local.slug}`);
  }

  return <CheckoutClient locationId={local.id} slug={local.slug} />;
}