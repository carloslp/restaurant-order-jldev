// Diagnóstico de conexión Supabase — no imprime secretos.
// Uso: node --env-file=.env.local scripts/diagnose.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('=== Diagnóstico Supabase ===');
console.log('URL set:', !!url, '| anon set:', !!anon, '| secret set:', !!secret);
if (!url) { console.log('FALTA SUPABASE_URL'); process.exit(1); }

const check = async (label, client, table, opts = {}) => {
  try {
    const q = client.from(table).select('*', { head: true, count: 'exact' }).limit(1);
    const { count, error } = await q;
    console.log(`[${label}] ${table}:`, error ? `ERROR ${error.code} ${error.message}` : `OK (count=${count})`);
    return !error;
  } catch (e) {
    console.log(`[${label}] ${table}: EXCEPCIÓN ${e.message}`);
    return false;
  }
};

// 1) Con anon (público)
const anonClient = createClient(url, anon, { auth: { persistSession: false } });
await check('anon ', anonClient, 'locals');
await check('anon ', anonClient, 'categories');
await check('anon ', anonClient, 'orders');

// 2) Con secret (service role)
const secretClient = createClient(url, secret, { auth: { persistSession: false } });
await check('srv  ', secretClient, 'locals');
await check('srv  ', secretClient, 'orders');

// 3) ¿Hay algún local? (con secret, para que RLS no interfiera)
const { data: locals, error: locErr } = await secretClient.from('locals').select('id, subdomain, name');
if (locErr) {
  console.log('locals (srv): ERROR al leer:', locErr.message);
} else {
  console.log('locals (srv):', locals.length ? locals.map(l => l.subdomain).join(', ') : '(vacía — falta seed)');
}

console.log('=== Fin diagnóstico ===');