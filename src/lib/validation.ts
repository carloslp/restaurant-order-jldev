import { z } from 'zod';

// Validaciones de dominio compartidas (server y cliente).

// Días de la semana: 0=Dom .. 6=Sáb (ISO)
export const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function isValidPhone(phone: string): boolean {
  // Acepta dígitos, +, espacios, guiones, paréntesis — entre 8 y 20 caracteres
  const clean = phone.replace(/[\s\-()]/g, '');
  return /^\+?[0-9]{8,16}$/.test(clean);
}

export function isValidName(name: string): boolean {
  return name.trim().length >= 2;
}

export function isValidAddress(address: string): boolean {
  return address.trim().length >= 5;
}

export function isValidReferences(ref: string | null): boolean {
  if (!ref) return true;
  return ref.trim().length <= 120;
}

export const DiscountTypeEnum = z.enum(['PERCENTAGE', 'FIXED_AMOUNT']);

export const DiscountSchema = z.object({
  description: z.string().min(3, 'La descripción es requerida'),
  discount_type: DiscountTypeEnum,
  value: z.coerce.number().min(0, 'El valor debe ser positivo'),
  min_purchase: z.coerce.number().min(0).default(0),
  code: z.string().optional().nullable(),
  applies_to_product_ids: z.array(z.string().uuid()).optional().default([]),
  applies_to_category_ids: z.array(z.string().uuid()).optional().default([]),
  starts_at: z.string().datetime().optional().nullable(),
  ends_at: z.string().datetime().optional().nullable(),
  days_of_week: z.array(z.number().min(0).max(6)).optional().nullable(),
  time_of_day_start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional().nullable(),
  time_of_day_end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional().nullable(),
  usage_limit_total: z.coerce.number().int().positive().optional().nullable(),
  usage_limit_per_customer: z.coerce.number().int().positive().optional().nullable(),
  usage_limit_per_day: z.coerce.number().int().positive().optional().nullable(),
  is_active: z.boolean().default(true),
}).refine(data => {
  if (data.discount_type === 'PERCENTAGE' && data.value > 100) return false;
  return true;
}, {
  message: 'El porcentaje no puede ser mayor a 100',
  path: ['value'],
});
