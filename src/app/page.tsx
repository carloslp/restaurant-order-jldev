// Índice raíz: las locations se manejan por path (/{slug}).
// - Si solo hay un local → redirect directo a su menú.
// - Si hay varios → lista simple para elegir la sucursal.
// - Si no hay locales → placeholder con enlace al setup.
// Sin ninguna configuración de dominio: funciona en localhost, Vercel o cualquier dominio.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { listLocalSummaries } from '@/lib/server/local';
import { Store, ArrowRight, UtensilsCrossed, Settings, AlertCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function Home() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-orange-50/50 to-white flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl shadow-orange-950/5 border border-orange-100/80 p-6 sm:p-8 text-center">
          <div className="mx-auto w-14 h-14 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Restaurant Order</h1>
          <p className="text-zinc-500 text-sm mt-2 leading-relaxed">
            Configura las credenciales de tu proyecto en <code className="bg-zinc-100 text-zinc-800 px-1.5 py-0.5 rounded text-xs font-mono font-medium">.env.local</code> para sincronizar las sucursales.
          </p>
          <div className="mt-6 rounded-xl bg-amber-50/60 border border-amber-200/60 p-4 text-xs font-medium text-amber-800">
            Sin conexión a Supabase activa en este momento.
          </div>
        </div>
      </main>
    );
  }

  const locals = await listLocalSummaries();

  if (locals.length === 1) {
    redirect(`/${locals[0].slug}`);
  }

  if (locals.length === 0) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-orange-50/50 to-white flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl shadow-orange-950/5 border border-orange-100/80 p-6 sm:p-8 text-center">
          <div className="mx-auto w-14 h-14 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
            <UtensilsCrossed className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Bienvenido</h1>
          <p className="text-zinc-500 text-sm mt-2 leading-relaxed">
            Aún no hay sucursales registradas en el sistema. Inicializa el restaurante para comenzar.
          </p>
          <Link
            href="/setup"
            className="mt-6 inline-flex items-center justify-center gap-2 w-full rounded-xl bg-orange-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-orange-600/20 hover:bg-orange-700 active:scale-[0.98] transition-all"
          >
            <Settings className="w-4 h-4" />
            Configurar el sistema
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50/30 to-zinc-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-xl w-full">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-orange-500 text-white rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-orange-500/25">
            <UtensilsCrossed className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-4xl">
            Elige tu sucursal
          </h1>
          <p className="text-zinc-500 text-sm sm:text-base mt-2">
            Selecciona el restaurante más cercano para ver la carta y ordenar en línea.
          </p>
        </div>

        <div className="grid gap-3.5">
          {locals.map((local) => (
            <Link
              key={local.id}
              href={`/${local.slug}`}
              className="group relative flex items-center justify-between p-5 bg-white rounded-2xl border border-zinc-200/80 shadow-sm hover:shadow-md hover:border-orange-500/50 active:scale-[0.99] transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center group-hover:bg-orange-600 group-hover:text-white transition-colors">
                  <Store className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-zinc-900 group-hover:text-orange-600 transition-colors">
                    {local.name}
                  </h2>
                  <p className="text-xs text-zinc-400 font-mono mt-0.5">/{local.slug}</p>
                </div>
              </div>
              <div className="w-9 h-9 rounded-full bg-zinc-50 flex items-center justify-center text-zinc-400 group-hover:bg-orange-50 group-hover:text-orange-600 transition-colors">
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}