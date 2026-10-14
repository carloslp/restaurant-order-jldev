// src/app/track/fila/[token]/page.tsx
import { notFound } from 'next/navigation';
import { getWaitlistStatusByToken } from '@/lib/server/waitlist';
import WaitlistTrackingClient from './WaitlistTrackingClient';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ token: string }>;
}

export default async function WaitlistTrackingPage({ params }: Props) {
  const { token } = await params;
  const data = await getWaitlistStatusByToken(token);

  if (!data.ok || !data.party) {
    notFound();
  }

  return (
    <WaitlistTrackingClient
      initialData={data.party}
      token={token}
      localName={data.localName || 'Restaurante'}
      localSlug={data.localSlug || null}
    />
  );
}
