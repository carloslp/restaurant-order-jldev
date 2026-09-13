// Verificación de JWTs de Supabase Auth (staff) usando el JWKS remoto.
// Útil para proteger Server Actions / rutas de staff (admin, cajero, cocinero).

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  const url = process.env.SUPABASE_JWKS_URL;
  if (!url) throw new Error('SUPABASE_JWKS_URL no configurada');
  if (!jwks) jwks = createRemoteJWKSet(new URL(url));
  return jwks;
}

function getIssuer(): string | undefined {
  const url = process.env.SUPABASE_URL;
  return url ? `${url.replace(/\/$/, '')}/auth/v1` : undefined;
}

/** Verifica un access token de Supabase Auth y devuelve su payload (claims). */
export async function verifySupabaseJWT(
  token: string,
  audience?: string
): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, getJwks(), {
    issuer: getIssuer(),
    audience,
  });
  return payload;
}