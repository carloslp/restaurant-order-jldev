// Diagnóstico de visibilidad del menú público: compara lo que el admin
// guarda (service_role, sin RLS) contra lo que el menú muestra (anon + RLS).
// Detecta: locales sin slug, categorías inactivas, productos no disponibles,
// productos huérfanos (categoría de otro local / inexistente) y fallos por tabla.
// Uso:
//   node --env-file=.env scripts/check-seed.mjs [slug]
//   node --env-file=.env.local scripts/check-seed.mjs [slug]
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
  console.error('Faltan vars: SUPABASE_URL, SUPABASE_SECRET_KEY y ANON/PUBLISHABLE key.');
  process.exit(1);
}

const slugFilter = process.argv[2] ?? null;
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

let failed = false;
const warn = (msg) => { failed = true; console.log(`  ⚠️ ${msg}`); };
const ok = (msg) => console.log(`  ✓ ${msg}`);

const localsRes = await admin.from('locals').select('id, name, slug').order('created_at', { ascending: true });
if (localsRes.error) { console.error('ERROR locals:', localsRes.error); process.exit(1); }
const locals = (localsRes.data ?? []).filter((l) => !slugFilter || l.slug === slugFilter);
if (!locals.length) { console.error(`No hay local con slug "${slugFilter}".`); process.exit(1); }

for (const local of locals) {
  console.log(`\nLocal "${local.name}" (/${local.slug} ${local.id})`);

  // Mismas 4 queries que getMenu() pero separadas para diagnosticar por tabla.
  const [catAdmin, prodAdmin, grpAdmin, optAdmin] = await Promise.all([
    admin.from('categories').select('id, name, is_active').eq('location_id', local.id),
    admin.from('products').select('id, name, is_available, category_id').eq('location_id', local.id),
    admin.from('modifier_groups').select('id').eq('location_id', local.id),
    admin.from('modifier_options').select('id').eq('location_id', local.id),
  ]);
  for (const [label, res] of [['categories', catAdmin], ['products', prodAdmin], ['modifier_groups', grpAdmin], ['modifier_options', optAdmin]]) {
    if (res.error) warn(`${label}: ERROR ${res.error.code}: ${res.error.message}`);
    else ok(`${label}: ${res.data?.length ?? 0} filas (admin)`);
  }
  const cats = catAdmin.data ?? [];
  const prods = prodAdmin.data ?? [];

  // Lo que realmente ve el menú público (filtros de getMenu + RLS anon).
  const [catPub, prodPub] = await Promise.all([
    anon.from('categories').select('id').eq('location_id', local.id).eq('is_active', true),
    anon.from('products').select('id').eq('location_id', local.id).eq('is_available', true),
  ]);
  if (catPub.error) warn(`menú público categories: ERROR ${catPub.error.code}: ${catPub.error.message}`);
  else ok(`menú público categories: ${catPub.data?.length ?? 0} visibles`);
  if (prodPub.error) warn(`menú público products: ERROR ${prodPub.error.code}: ${prodPub.error.message}`);
  else ok(`menú público products: ${prodPub.data?.length ?? 0} visibles`);

  const activeCats = new Set(cats.filter((c) => c.is_active).map((c) => c.id));
  const inactive = cats.filter((c) => !c.is_active);
  if (inactive.length) warn(`${inactive.length} categoría(s) inactiva(s) — sus productos no se muestran: ${inactive.map((c) => c.name).join(', ')}`);

  const orphans = prods.filter((p) => !activeCats.has(p.category_id));
  if (orphans.length) warn(`${orphans.length} producto(s) huérfano(s) (categoría inactiva/de otro local/inexistente): ${orphans.map((p) => p.name).join(', ')}`);

  const unavailable = prods.filter((p) => !p.is_available);
  if (unavailable.length) warn(`${unavailable.length} producto(s) con is_available=false — el menú los oculta: ${unavailable.map((p) => p.name).join(', ')}`);

  const visibleCount = (prodPub.data ?? []).length;
  if (prods.length && !visibleCount) warn('Hay productos en admin pero 0 visibles en menú → revisa slug, is_active/is_available y RLS.');
  if (prods.length && visibleCount) ok(`${visibleCount}/${prods.length} productos visibles en /${local.slug}`);
}

process.exit(failed ? 2 : 0);

