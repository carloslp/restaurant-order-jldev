// Inspección del estado del seed — no imprime secretos.
// Uso: node --env-file=.env.local scripts/inspect-seed.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const client = createClient(url, secret, { auth: { persistSession: false } });

const count = async (table) => {
  const { count, error } = await client.from(table).select('*', { head: true, count: 'exact' });
  if (error) { console.log(`${table}: ERROR ${error.message}`); return null; }
  console.log(`${table}: ${count}`);
  return count;
};

await count('locals');
await count('staff');
await count('categories');
await count('products');
await count('modifier_groups');
await count('modifier_options');
await count('allergens');
await count('diet_labels');
await count('local_zone_capacity');

const { data: locals, error } = await client.from('locals').select('id, subdomain, name, delivery_fee');
if (error) console.log('locals err:', error.message);
else console.log('locals:', locals.length ? JSON.stringify(locals) : '(vacía)');