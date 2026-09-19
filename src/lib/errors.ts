// Catálogo central de errores en español.
// Regla: el servidor NUNCA filtra el error crudo de Supabase/Zod al cliente.
// El crudo se loguea en servidor; al cliente solo llega `UserFacingError`.

import { z } from 'zod';

export interface FieldErrors {
  [field: string]: string;
}

export interface UserFacingError {
  message: string;
  fieldErrors?: FieldErrors;
}

// Error ya traducido, listo para mostrar. Lanzarlo desde Server Actions
// en lugar de `throw error` crudo de Supabase.
export class AppError extends Error {
  fieldErrors?: FieldErrors;
  cause?: unknown;
  constructor(message: string, opts?: { fieldErrors?: FieldErrors; cause?: unknown }) {
    super(message);
    this.name = 'AppError';
    this.fieldErrors = opts?.fieldErrors;
    this.cause = opts?.cause;
  }
}

interface SupabaseLikeError {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

function asSupabaseError(err: unknown): SupabaseLikeError | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as Record<string, unknown>;
  if (typeof e['code'] !== 'string' && typeof e['message'] !== 'string') return null;
  return {
    code: typeof e['code'] === 'string' ? (e['code'] as string) : undefined,
    message: typeof e['message'] === 'string' ? (e['message'] as string) : undefined,
    details: typeof e['details'] === 'string' ? (e['details'] as string) : null,
    hint: typeof e['hint'] === 'string' ? (e['hint'] as string) : null,
  };
}

// Mapa PostgREST/Postgres → español. PGRST204 (columna inexistente) se reporta
// como error de configuración: es bug nuestro, no culpa del usuario.
export function parsePostgrestError(err: unknown, fallback = 'Ocurrió un error al guardar. Inténtalo de nuevo.'): string {
  const e = asSupabaseError(err);
  if (!e) {
    if (err instanceof Error && err.message) return fallback;
    return fallback;
  }
  switch (e.code) {
    case '23505':
      return 'Ya existe un registro con esos datos. Revisa duplicados (nombre, ruta o código).';
    case '23503':
      return 'Referencia inválida: el registro relacionado no existe o es de otro local.';
    case '23514':
      return 'Los datos no cumplen las reglas del sistema (revisa precios, cantidades y rangos).';
    case '23502':
      return 'Falta un dato obligatorio. Completa todos los campos requeridos.';
    case '22P02':
    case '22001':
      return 'El formato de un campo no es válido. Revisa los valores ingresados.';
    case 'PGRST116':
      return 'No se encontró el registro. Es posible que ya haya sido eliminado.';
    case 'PGRST204':
      return 'Error de configuración del sistema. Reporta a soporte indicando qué hacías.';
    case 'PGRST200':
    case 'PGRST201':
      return 'Error de configuración del sistema. Reporta a soporte indicando qué hacías.';
    default:
      break;
  }
  const msg = (e.message ?? '').toLowerCase();
  if (msg.includes('bucket') && msg.includes('not found')) return 'Almacenamiento de imágenes no configurado. Reporta a soporte.';
  if (msg.includes('too large') || msg.includes('exceeds') || msg.includes('5mb')) return 'El archivo supera el tamaño máximo de 5MB.';
  if (msg.includes('invalid input syntax for type uuid')) return 'Identificador inválido. Recarga la página e inténtalo de nuevo.';
  if (msg.includes('jwt') || msg.includes('not authenticated')) return 'Tu sesión expiró. Inicia sesión de nuevo.';
  return fallback;
}

export function formatZodError(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  const flat = error.flatten().fieldErrors as Record<string, unknown>;
  for (const [key, msgs] of Object.entries(flat)) {
    if (Array.isArray(msgs) && msgs.length && typeof msgs[0] === 'string') out[key] = msgs[0];
  }
  return out;
}

const GENERIC_PATTERN =
  /error|pgrst|supabase|postgres|violates|constraint|duplicate|failed|invalid input syntax|uuid|column|relation|schema|bucket/i;

// Última barrera del lado cliente: si por error llega un crudo técnico,
// se reemplaza por un mensaje genérico en español.
export function toUserMessage(err: unknown, fallback = 'Ocurrió un error al guardar. Inténtalo de nuevo.'): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof z.ZodError) {
    const fields = formatZodError(err);
    const first = Object.values(fields)[0];
    return first ?? 'Revisa los campos marcados e inténtalo de nuevo.';
  }
  if (err instanceof Error) {
    if (!err.message || GENERIC_PATTERN.test(err.message)) return fallback;
    return err.message;
  }
  if (typeof err === 'string') {
    if (!err || GENERIC_PATTERN.test(err)) return fallback;
    return err;
  }
  return fallback;
}

export function toUserFieldErrors(err: unknown): FieldErrors | undefined {
  if (err instanceof AppError) return err.fieldErrors;
  if (err instanceof z.ZodError) return formatZodError(err);
  return undefined;
}

// Helper para Server Actions: valida con safeParse y lanza AppError con
// fieldErrors en vez del ZodError crudo.
export function parseOrThrow<T>(schema: z.ZodType<T>, payload: unknown): T {
  const res = schema.safeParse(payload);
  if (!res.success) {
    throw new AppError('Revisa los campos marcados e inténtalo de nuevo.', {
      fieldErrors: formatZodError(res.error),
      cause: res.error,
    });
  }
  return res.data;
}

// Helper para Server Actions: ejecuta Supabase y traduce errores PG/PGRST.
// Loguea el crudo en servidor; lanza AppError mostrable.
// Acepta el builder de PostgREST (thenable) además de promesas.
export async function queryOrThrow<T>(
  promise: PromiseLike<{ data: T; error: unknown }>,
  opts?: { action?: string; fallback?: string }
): Promise<NonNullable<T>> {
  const { data, error } = await promise;
  if (error) {
    if (opts?.action) console.error(`${opts.action}:`, error);
    else console.error('Supabase error:', error);
    throw new AppError(parsePostgrestError(error, opts?.fallback));
  }
  if (data === null || data === undefined) {
    if (opts?.action) console.error(`${opts.action}: sin datos (posible RLS o registro inexistente)`);
    throw new AppError(opts?.fallback ?? 'No se encontró el registro. Es posible que ya haya sido eliminado.');
  }
  return data as NonNullable<T>;
}
