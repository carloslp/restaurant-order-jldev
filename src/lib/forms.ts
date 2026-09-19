'use client';

import { useCallback, useState } from 'react';
import { toUserMessage, toUserFieldErrors, type FieldErrors } from '@/lib/errors';

// Estado estándar de submit para formularios admin:
// - error general persistente (no solo toast)
// - errores por campo (del servidor vía AppError/Zod)
// - los valores del form se conservan al fallar (el llamador no los limpia)
export function useServerForm() {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const clearErrors = useCallback(() => {
    setFormError(null);
    setFieldErrors({});
  }, []);

  const clearFieldError = useCallback((field: string) => {
    setFieldErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  // Envuelve una Server Action: gestiona saving + traduce cualquier error
  // crudo a mensaje en español. Retorna true si tuvo éxito.
  const submit = useCallback(async (fn: () => Promise<unknown>): Promise<boolean> => {
    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await fn();
      return true;
    } catch (err) {
      setFormError(toUserMessage(err));
      const fields = toUserFieldErrors(err);
      if (fields) setFieldErrors(fields);
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  return { saving, formError, fieldErrors, setFormError, clearErrors, clearFieldError, submit };
}
