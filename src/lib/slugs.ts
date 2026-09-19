// Helper compartido: slugs de location (rutas de sucursal).
// Cada location se maneja por path: {dominio}/{slug}. El dominio es irrelevante
// (1 restaurante = 1 dominio propio); solo importa el slug dentro de la app.

import { z } from 'zod';

export const SLUG_REGEX = /^[a-z0-9-]+$/;

// Segmentos raíz reservados por rutas del sistema (no pueden usarse como slug
// de location porque Next.js da prioridad a los segmentos estáticos).
export const RESERVED_LOCATION_SLUGS = ['api', 'staff', 'login', 'setup', 'track', 'checkout'] as const;

export function validateLocationSlug(slug: string): string | null {
  if (slug.length < 3) return 'La ruta debe tener al menos 3 caracteres';
  if (slug.length > 63) return 'Máximo 63 caracteres';
  if (!SLUG_REGEX.test(slug)) return 'Solo letras minúsculas, números y guiones';
  if ((RESERVED_LOCATION_SLUGS as readonly string[]).includes(slug)) {
    return `"${slug}" es una ruta reservada del sistema, elige otra`;
  }
  return null;
}

// Schema Zod compartido (cliente y servidor usan las mismas reglas/mensajes).
export const locationSlugSchema = z
  .string()
  .min(3, 'La ruta debe tener al menos 3 caracteres')
  .max(63, 'Máximo 63 caracteres')
  .regex(SLUG_REGEX, 'Solo letras minúsculas, números y guiones')
  .refine(
    (s) => !(RESERVED_LOCATION_SLUGS as readonly string[]).includes(s),
    { message: 'Esa ruta está reservada por el sistema, elige otra' }
  );