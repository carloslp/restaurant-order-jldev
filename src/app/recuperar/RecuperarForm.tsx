'use client';

import { useActionState } from 'react';
import { requestPasswordReset } from '@/lib/server/auth-recovery';
import { Mail, Loader2, ArrowRight, MailCheck } from 'lucide-react';
import Link from 'next/link';

export function RecuperarForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, null);

  if (state?.success) {
    return (
      <div className="text-center">
        <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
          <MailCheck className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-zinc-900">Revisa tu email</h2>
        <p className="text-xs sm:text-sm text-zinc-500 mt-2 leading-relaxed">
          Si el email está registrado, te enviamos un enlace para definir una nueva
          contraseña. El enlace expira en poco tiempo.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200/80 px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-all"
        >
          Volver al login
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
          Correo Electrónico
        </label>
        <div className="relative">
          <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="staff@tulocal.com"
            className="w-full rounded-xl border border-zinc-200/80 bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white text-zinc-900 text-sm pl-10 pr-3.5 py-2.5 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all outline-none"
          />
        </div>
      </div>

      {state?.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-orange-600/20 hover:bg-orange-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed select-none"
      >
        {pending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Enviando...</span>
          </>
        ) : (
          <>
            <span>Enviar enlace de recuperación</span>
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>

      <div className="pt-2 text-center">
        <Link href="/login" className="text-xs font-semibold text-zinc-500 hover:text-zinc-800 transition-colors">
          Volver al login
        </Link>
      </div>
    </form>
  );
}