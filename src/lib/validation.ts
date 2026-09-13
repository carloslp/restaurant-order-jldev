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