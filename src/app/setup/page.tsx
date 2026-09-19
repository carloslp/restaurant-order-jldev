import { checkSystemInitialized } from '@/lib/server/setup';
import { redirect } from 'next/navigation';
import { SetupForm } from './SetupForm';
import { Sparkles, UtensilsCrossed } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  // Verificar si el sistema ya está inicializado (Server Component)
  const isInitialized = await checkSystemInitialized();

  if (isInitialized) {
    // Redirigir a login si ya hay locales
    return redirect('/login');
  }

  // Mostrar el formulario de setup (Client Component)
  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50/40 via-zinc-50 to-white flex items-center justify-center py-10 sm:py-16 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-xl space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner ring-4 ring-orange-50">
            <UtensilsCrossed className="w-7 h-7" />
          </div>
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-orange-50 text-orange-700 text-xs font-bold tracking-wider uppercase mb-2">
            <Sparkles className="w-3.5 h-3.5" /> Puesta en Marcha
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900">
            Configuración Inicial
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-1 max-w-md mx-auto">
            Crea tu primera sucursal gastronómica y la cuenta de administrador para comenzar a recibir pedidos.
          </p>
        </div>

        <SetupForm />
      </div>
    </div>
  );
}