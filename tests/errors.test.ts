// Unit tests del catálogo central de errores (sin DB).
// Cubren: mapeo PG/PGRST → español, saneamiento de crudos (toUserMessage),
// fieldErrors de Zod, parseOrThrow y queryOrThrow.
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  AppError,
  parsePostgrestError,
  formatZodError,
  toUserMessage,
  toUserFieldErrors,
  parseOrThrow,
  queryOrThrow,
} from '@/lib/errors';
import { zNumberES } from '@/lib/validation';

const pgError = (code: string, message = 'database error') => ({ code, message, details: null, hint: null });

describe('parsePostgrestError', () => {
  it('traduce unique violation (23505)', () => {
    expect(parsePostgrestError(pgError('23505'))).toMatch(/Ya existe/);
  });

  it('traduce FK violation (23503)', () => {
    expect(parsePostgrestError(pgError('23503'))).toMatch(/Referencia inválida/);
  });

  it('traduce check violation (23514)', () => {
    expect(parsePostgrestError(pgError('23514'))).toMatch(/reglas del sistema/);
  });

  it('traduce not null violation (23502)', () => {
    expect(parsePostgrestError(pgError('23502'))).toMatch(/dato obligatorio/);
  });

  it('traduce registro inexistente (PGRST116)', () => {
    expect(parsePostgrestError(pgError('PGRST116'))).toMatch(/No se encontró/);
  });

  it('traduce columna inexistente (PGRST204) como error de config', () => {
    expect(parsePostgrestError(pgError('PGRST204'))).toMatch(/configuración/);
  });

  it('traduce relationship inexistente (PGRST200) como error de config', () => {
    expect(parsePostgrestError(pgError('PGRST200'))).toMatch(/configuración/);
  });

  it('traduce storage bucket not found', () => {
    expect(parsePostgrestError(pgError('', 'Bucket not found'))).toMatch(/Almacenamiento/);
  });

  it('traduce archivo demasiado grande', () => {
    expect(parsePostgrestError(pgError('', 'Payload too large'))).toMatch(/5MB/);
  });

  it('usa fallback para códigos desconocidos', () => {
    expect(parsePostgrestError(pgError('XXXXX'), 'Mensaje custom')).toBe('Mensaje custom');
  });

  it('usa fallback ante errores que no son de Supabase', () => {
    expect(parsePostgrestError(new Error('boom'), 'Fb')).toBe('Fb');
    expect(parsePostgrestError('string raro', 'Fb')).toBe('Fb');
  });
});

describe('toUserMessage — barrera anti-crudo', () => {
  it('pasa el mensaje de AppError tal cual', () => {
    expect(toUserMessage(new AppError('Ya existe un local con esa ruta.'))).toBe('Ya existe un local con esa ruta.');
  });

  it('extrae el primer fieldError de un ZodError', () => {
    const err = new z.ZodError([
      { code: 'too_small', path: ['base_price'], message: 'El precio debe ser mayor a 0', type: 'number', minimum: 0, inclusive: false, input: 0, origin: 'number' },
      { code: 'invalid_string', path: ['name'], message: 'El nombre es requerido', validation: 'min', input: '', origin: 'string' },
    ] as any);
    expect(toUserMessage(err)).toMatch(/precio|nombre/);
  });

  it('reemplaza mensajes técnicos crudos por el fallback', () => {
    expect(toUserMessage(new Error('PGRST204 : could not find the column'))).toMatch(/Inténtalo de nuevo/);
    expect(toUserMessage(new Error('duplicate key value violates unique constraint "x"'))).toMatch(/Inténtalo de nuevo/);
    expect(toUserMessage('ERROR: syntax error at or near "foo"')).toMatch(/Inténtala de nuevo|Inténtalo de nuevo/);
  });

  it('conserva mensajes de Error legibles en español', () => {
    expect(toUserMessage(new Error('No puedes eliminarte a ti mismo.'))).toBe('No puedes eliminarte a ti mismo.');
  });

  it('fallback ante undefined/objetos raros', () => {
    expect(toUserMessage(undefined, 'Fb')).toBe('Fb');
    expect(toUserMessage({ raro: true }, 'Fb')).toBe('Fb');
  });
});

describe('formatZodError / toUserFieldErrors', () => {
  const schema = z.object({
    name: z.string().min(1, 'El nombre es requerido'),
    base_price: zNumberES('El precio debe ser un número').positive('El precio debe ser mayor a 0'),
  });

  it('devuelve un mensaje por campo', () => {
    const res = schema.safeParse({ name: '', base_price: 'hola' });
    expect(res.success).toBe(false);
    if (!res.success) {
      const fields = formatZodError(res.error);
      expect(fields.name).toBe('El nombre es requerido');
      expect(fields.base_price).toBe('El precio debe ser un número');
    }
  });

  it('zNumberES evita el "Invalid input" en inglés con basura numérica', () => {
    const res = schema.safeParse({ name: 'x', base_price: 'abc' });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(JSON.stringify(formatZodError(res.error))).not.toMatch(/Invalid input|NaN/);
    }
  });

  it('acepta strings numéricos provenientes de <input type="number">', () => {
    expect(schema.parse({ name: 'Tacos', base_price: '12.5' })).toEqual({ name: 'Tacos', base_price: 12.5 });
  });

  it('toUserFieldErrors devuelve undefined para errores normales', () => {
    expect(toUserFieldErrors(new Error('x'))).toBeUndefined();
  });
});

describe('parseOrThrow', () => {
  const schema = z.object({ name: z.string().min(1, 'El nombre es requerido') });

  it('devuelve los datos validados cuando es correcto', () => {
    expect(parseOrThrow(schema, { name: 'Tacos' })).toEqual({ name: 'Tacos' });
  });

  it('lanza AppError con fieldErrors cuando falla', () => {
    try {
      parseOrThrow(schema, { name: '' });
      expect.unreachable('debía lanzar');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).fieldErrors?.name).toBe('El nombre es requerido');
    }
  });
});

describe('queryOrThrow', () => {
  it('devuelve data cuando no hay error', async () => {
    const p = Promise.resolve({ data: { id: '1' }, error: null });
    await expect(queryOrThrow(p)).resolves.toEqual({ id: '1' });
  });

  it('lanza AppError traducido cuando hay error PG', async () => {
    const p = Promise.resolve({ data: null, error: pgError('23505') });
    await expect(queryOrThrow(p)).rejects.toThrow(/Ya existe/);
  });

  it('lanza AppError cuando data es null sin error (RLS/registro inexistente)', async () => {
    const p = Promise.resolve({ data: null, error: null });
    await expect(queryOrThrow(p, { fallback: 'No encontrado' })).rejects.toThrow('No encontrado');
  });
});
