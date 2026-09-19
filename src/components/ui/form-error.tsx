'use client';

import type { ReactNode } from 'react';

// Alerta de error general del formulario (arriba del form, persistente
// hasta el siguiente submit). No usar toast como único canal: el toast
// se auto-cierra y el usuario pierde el diagnóstico.
export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm font-medium text-red-700"
    >
      {message}
    </div>
  );
}

// Error bajo un campo. El `id` enlaza con aria-describedby del input.
export function FieldError({ id, message }: { id: string; message?: string | null }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-xs font-medium text-red-600">
      {message}
    </p>
  );
}

// Helper de accesibilidad: props para enlazar input ↔ error.
export function fieldAria(fieldErrorId: string, hasError: boolean) {
  return hasError ? { 'aria-describedby': fieldErrorId, 'aria-invalid': true as const } : {};
}

export type { ReactNode };
