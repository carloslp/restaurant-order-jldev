// Define la nueva contraseña. Requiere la sesión creada por el enlace de
// recovery (el callback intercambia el code y luego redirige aquí con ?next=).
import { redirect } from 'next/navigation';
import { createSessionServerClient } from '@/lib/supabase/session';
import { NuevaPasswordForm } from './NuevaPasswordForm';
import { ShieldCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Nueva contraseña',
};

export default async function NuevaPasswordPage() {
  const supabase = await createSessionServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sin sesión de recovery (link expirado/usado) → login
  if (!user) {
    redirect('/login?error=recovery_expired');
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50/40 via-zinc-50 to-white flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-white rounded-3xl border border-zinc-200/80 p-6 sm:p-8 shadow-xl shadow-zinc-950/5">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
            Define tu nueva contraseña
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-1">
            Para la cuenta <strong className="text-zinc-700">{user.email}</strong>
          </p>
        </div>

        <NuevaPasswordForm />
      </div>
    </div>
  );
}