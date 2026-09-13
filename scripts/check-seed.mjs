// Verifica que el seed haya cargado datos visibles para el menú público.
// Uso: node --env-file=.env.local scripts/check-seed.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ?? process.env.SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(url, anon);

const { data: locals, error: errLocals } = await supabase.from('locals').select('id, subdomain');
const { data: categories, error: errCats } = await supabase.from('categories').select('id');
const { data: products, error: errProducts } = await supabase.from('products').select('id');

const show = (label, data, err) =>
  console.log(
    `[${label}]`,
    err ? `ERROR ${err.code}: ${err.message}` : `${data?.length ?? 0} filas ${data?.length ? '(OK ✓)' : '(vacío)'}`
  );

show('locals   ', locals, errLocals);
show('categories', categories, errCats);
show('products ', products, errProducts);

if (!products?.length) console.log('\n⚠️ No hay productos visibles → la landing muestra el placeholder.');
else console.log('\n✓ Menú con datos — la landing debería renderizar el menú real.');
