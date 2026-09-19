import { checkSystemInitialized } from '@/lib/server/setup';
import { redirect } from 'next/navigation';
import { SetupForm } from './SetupForm';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  // Verificar si el sistema ya está inicializado (Server Component)
  const isInitialized = await checkSystemInitialized();

  if (isInitialized) {
    // Redirigir a login si ya hay locales
    return redirect('/staff/login');
  }

  // Mostrar el formulario de setup (Client Component)
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
            Configuración Inicial
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Configura tu primer local y usuario administrador
          </p>
        </div>
        <SetupForm />
      </div>
    </div>
  );
}