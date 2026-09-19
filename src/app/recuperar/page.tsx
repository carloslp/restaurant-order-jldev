// Página pública para solicitar recuperación de contraseña.
import { RecuperarForm } from './RecuperarForm';
import { KeyRound } from 'lucide-react';

export const metadata = {
  title: 'Recuperar contraseña',
};

export default function RecuperarPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50/40 via-zinc-50 to-white flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-white rounded-3xl border border-zinc-200/80 p-6 sm:p-8 shadow-xl shadow-zinc-950/5">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
            <KeyRound className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
            Recuperar contraseña
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-1">
            Ingresa tu email y te enviaremos un enlace para definir una nueva contraseña.
          </p>
        </div>

        <RecuperarForm />
      </div>
    </div>
  );
}