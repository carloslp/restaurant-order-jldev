// Migra la DB de dev: renombra locals.subdomain → locals.slug (via PostgREST RPC).
// El SQL Editor es la vía recomendada (docs/migrate-subdomain-to-slug.sql); este script
// automatiza el mismo cambio para desarrollo usando la secret key del .env.
// Uso: node --env-file=.env scripts/migrate-subdomain-to-slug.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !secret) {
  console.log('FALTA SUPABASE_URL / SUPABASE_SECRET_KEY');
  process.exit(1);
}

const supabase = createClient(url, secret, { auth: { persistSession: false } });

// 1. ¿Ya está migrada?
{
  const { error } = await supabase.from('locals').select('slug').limit(1);
  if (!error) {
    console.log('✅ La columna locals.slug ya existe. Nada que migrar.');
    process.exit(0);
  }
}

// 2. Renombrar vía RPC (sql function temporal no es posible con anon/secret;
//    probamos las variantes habituales de Supabase; si no, instrucciones manuales).
const migrationSql = 'ALTER TABLE locals RENAME COLUMN subdomain TO slug;';
let migrated = false;
const rpcVariants = [
  ['exec_sql', { sql: migrationSql }],
  ['exec_sql', { query: migrationSql }],
  ['pg_meta_execute_sql', { sql: migrationSql }],
];

for (const [fn, args] of rpcVariants) {
  const { error } = await supabase.rpc(fn, args);
  if (!error) { migrated = true; break; }
}

if (!migrated) {
  console.log('⚠️  No se pudo ejecutar vía RPC (ninguna función exec disponible).');
  console.log('');
  console.log('Ejecuta manualmente en Supabase → SQL Editor (como postgres):');
  console.log('');
  console.log(migrationSql);
  console.log('');
  console.log('O copia docs/migrate-subdomain-to-slug.sql completo (es idempotente).');
  process.exit(1);
}

console.log('✅ Migración aplicada: locals.subdomain → locals.slug');
const { data, error: readErr } = await supabase.from('locals').select('id, name, slug').limit(10);
if (!readErr) {
  console.log('Locales:', data.length ? data.map((l) => `${l.name} → /${l.slug}`).join(', ') : '(vacía — falta seed)');
}