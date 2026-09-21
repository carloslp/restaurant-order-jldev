// src/app/[location]/reservar/page.tsx
import { notFound } from 'next/navigation';
import { getLocalBySlug } from '@/lib/server/local';
import { getPublicLocalReservationConfig } from '@/lib/server/reservations';
import ReservationClient from './ReservationClient';

export const dynamic = 'force-dynamic';

export default async function ReservationPage({
  params,
}: {
  params: Promise<{ location: string }>;
}) {
  const { location: slug } = await params;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    notFound();
  }

  const local = await getLocalBySlug(slug);
  if (!local) {
    notFound();
  }

  const config = await getPublicLocalReservationConfig(slug);

  return (
    <ReservationClient
      local={local}
      zones={config.zones || []}
    />
  );
}
