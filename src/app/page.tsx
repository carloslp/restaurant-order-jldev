// Índice raíz: las locations se manejan por path (/{slug}).
// - Si solo hay un local → redirect directo a su menú.
// - Si hay varios → lista simple para elegir la sucursal.
// - Si no hay locales → placeholder con enlace al setup.
// Sin ninguna configuración de dominio: funciona en localhost, Vercel o cualquier dominio.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { listLocalSummaries } from '@/lib/server/local';

export const dynamic = 'force-dynamic';

export default async function Home() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="text-2xl font-bold">Restaurant Order JLDev</h1>
        <p className="text-gray-600 mt-2">
          Configurá <code className="bg-gray-100 px-1 rounded">.env.local</code> con tu proyecto
          Supabase para ver las sucursales.
        </p>
        <div className="mt-6 rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          🔌 Sin conexión a Supabase — mostrando placeholder.
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
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="text-2xl font-bold">Restaurant Order JLDev</h1>
        <p className="text-gray-600 mt-2">
          Aún no hay sucursales configuradas.
        </p>
        <Link
          href="/setup"
          className="mt-4 inline-block rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          Configurar el sistema
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-bold">Elige tu sucursal</h1>
      <p className="text-gray-600 mt-2">Cada sucursal tiene su propio menú en su ruta.</p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {locals.map((local) => (
          <li key={local.id}>
            <Link
              href={`/${local.slug}`}
              className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-orange-400 transition"
            >
              <span className="text-lg font-semibold text-gray-800">{local.name}</span>
              <span className="block mt-1 text-sm text-gray-500 font-mono">/{local.slug}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}