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

  // Si las reservas están desactivadas para este local, mostrar aviso amigable
  if (local.reservations_enabled === false) {
    return (
      <main className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-zinc-200 text-center shadow-sm space-y-4">
          <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto text-2xl">
            📅
          </div>
          <h1 className="text-xl font-bold text-zinc-900 tracking-tight">
            Reservaciones pausadas
          </h1>
          <p className="text-sm text-zinc-600 leading-relaxed">
            Las reservaciones de mesa en línea se encuentran temporalmente desactivadas para la sucursal <strong className="text-zinc-800">{local.name}</strong>.
          </p>
          <div className="pt-2">
            <a
              href={`/${local.slug}`}
              className="inline-flex items-center justify-center w-full px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm rounded-xl transition-all shadow-xs active:scale-95"
            >
              Ver menú de la sucursal
            </a>
          </div>
        </div>
      </main>
    );
  }

  const config = await getPublicLocalReservationConfig(slug);

  return (
    <ReservationClient
      local={local}
      zones={config.zones || []}
    />
  );
}
