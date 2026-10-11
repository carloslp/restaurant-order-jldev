// src/app/[location]/fila/page.tsx
import { notFound } from 'next/navigation';
import { getLocalBySlug } from '@/lib/server/local';
import WaitlistClient from './WaitlistClient';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ location: string }>;
}

export default async function WaitlistPage({ params }: Props) {
  const { location } = await params;
  const local = await getLocalBySlug(location);

  if (!local) {
    notFound();
  }

  return (
    <WaitlistClient
      local={{
        id: local.id,
        name: local.name,
        slug: local.slug,
        is_open: local.is_open !== false,
      }}
    />
  );
}
