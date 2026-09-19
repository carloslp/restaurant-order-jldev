// src/lib/server/cron-auth.ts
// Verificación de CRON_SECRET para los endpoints /api/cron/*.
// - Authorization: Bearer <CRON_SECRET>  (Vercel Cron)
// - ?secret=<CRON_SECRET>                (pg_cron / curl manual)
// Sin CRON_SECRET configurado el endpoint queda abierto (solo desarrollo):
// en producción DEBE definirse en las env vars del deployment.
import type { NextRequest } from 'next/server';

export function verifyCronSecret(request: Request | NextRequest): { ok: true } | { ok: false; error: string } {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      console.error('CRON_SECRET no configurado en producción: endpoint de cron bloqueado.');
      return { ok: false, error: 'Endpoint no configurado.' };
    }
    return { ok: true };
  }
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret');
  const header = request.headers.get('authorization') ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const provided = bearer ?? querySecret;
  if (!provided || provided !== expected) {
    return { ok: false, error: 'No autorizado.' };
  }
  return { ok: true };
}
