// Utilidades de tokens: generación y hashing.
// El token plano se envía por link; solo se guarda su hash.
// El hash usa bcrypt ($2a$) para que sea verificable por el RLS de Supabase,
// que compara con crypt(token_plano, hash) de pgcrypto.

import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';

/** Genera un token plano de N caracteres alfanuméricos (default 16). */
export function generateToken(length = 16): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; // sin 0/O/1/l/I
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

/** Hash de un token plano (bcrypt, formato $2a$ compatible con pgcrypto crypt()). */
export function hashToken(token: string): string {
  return bcrypt.hashSync(token, 10);
}

/** Verifica un token plano contra un hash bcrypt ($2a$/$2b$). */
export function verifyToken(token: string, hash: string): boolean {
  if (!hash || (!hash.startsWith('$2a$') && !hash.startsWith('$2b$') && !hash.startsWith('$2y$'))) {
    return false;
  }
  try {
    return bcrypt.compareSync(token, hash);
  } catch {
    return false;
  }
}