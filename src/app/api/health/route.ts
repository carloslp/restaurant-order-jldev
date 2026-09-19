// src/app/api/health/route.ts
// Health check para uptime monitors (UptimeRobot etc.) y smoke tests de deploy.
// Verifica: variables de entorno + conectividad a Supabase (RPC set_config).
import { NextResponse } from 'next/server';
import { createAnonServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, 'ok' | 'error' | string> = {};

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    checks.env = 'error: faltan SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL';
    return NextResponse.json({ status: 'error', checks }, { status: 503 });
  }

  try {
    const supabase = createAnonServerClient();
    // Ping liviano a Postgres vía PostgREST (select mínimo con límite 1).
    const { error } = await supabase.from('locals').select('id').limit(1);
    if (error) {
      checks.supabase = `error: ${error.code ?? error.message}`;
      return NextResponse.json({ status: 'error', checks }, { status: 503 });
    }
    checks.supabase = 'ok';
  } catch (err) {
    checks.supabase = 'error: sin conexión';
    return NextResponse.json({ status: 'error', checks }, { status: 503 });
  }

  checks.env = 'ok';
  return NextResponse.json({ status: 'ok', checks, timestamp: new Date().toISOString() });
}
