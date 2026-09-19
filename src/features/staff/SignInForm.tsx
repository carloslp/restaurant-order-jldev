// src/features/staff/SignInForm.tsx
'use client';

import { useActionState } from 'react';
import { signInWithEmailPassword } from './auth';
import { Lock, Mail, Loader2, ArrowRight, ShieldCheck } from 'lucide-react';

export function SignInForm() {
  const [state, formAction, pending] = useActionState(signInWithEmailPassword, null);

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50/40 via-zinc-50 to-white flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-white rounded-3xl border border-zinc-200/80 p-6 sm:p-8 shadow-xl shadow-zinc-950/5">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
            Portal de Equipo
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-1">
            Ingresa tus credenciales para acceder al sistema operativo.
          </p>
        </div>

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

          <div>
            <label htmlFor="password" className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
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
                <span>Iniciando sesión...</span>
              </>
            ) : (
              <>
                <span>Iniciar sesión</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-zinc-100 flex items-center justify-center gap-1.5 text-[11px] text-zinc-400">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Acceso restringido por roles (Caja, Cocina, Admin)</span>
        </div>
      </div>
    </div>
  );
}