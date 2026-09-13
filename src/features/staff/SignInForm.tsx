// src/features/staff/SignInForm.tsx
'use client';

import { useActionState } from 'react';
import { signInWithMagicLink } from './auth';

export function SignInForm() {
  const [state, formAction, pending] = useActionState(signInWithMagicLink, null);

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-bold text-gray-800">
          Acceso al equipo
        </h1>
        <p className="mb-6 text-center text-sm text-gray-500">
          Ingresá tu email de trabajo. Te enviaremos un link mágico para entrar.
        </p>
        <form action={formAction} className="space-y-4">
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="cajero@tulocal.com"
            className="block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          {state?.error && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? 'Enviando link...' : 'Enviar link mágico'}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-gray-400">
          Solo personal autorizado. El acceso está limitado por rol.
        </p>
      </div>
    </div>
  );
}