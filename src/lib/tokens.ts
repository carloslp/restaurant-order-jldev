// Utilidades de tokens: generación y hashing.
// El token plano se envía por link; solo se guarda su hash (bcrypt).
// Usa la lib nativa crypto del runtime.

import { createHash, randomBytes } from 'crypto';

/** Genera un token plano de N caracteres alfanuméricos (default 12). */
export function generateToken(length = 12): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; // sin 0/O/1/l/I
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

/** Hash de un token plano (SHA-256, suficiente para tokens de alta entropía). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Verifica un token plano contra un hash. */
export function verifyToken(token: string, hash: string): boolean {
  const candidate = hashToken(token);
  // comparación en tiempo constante
  if (candidate.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return diff === 0;
}