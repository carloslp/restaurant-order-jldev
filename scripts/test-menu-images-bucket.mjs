// Prueba end-to-end del bucket de imágenes: sube un PNG mínimo, valida la URL
// pública y lo borra. Uso: node --env-file=.env scripts/test-menu-images-bucket.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, secret, { auth: { persistSession: false } });

// PNG de 1x1 px (8 bytes base) mínimo válido
const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const path = 'test/categories/test-upload.png';
const { error: upErr } = await supabase.storage.from('menu-images').upload(path, png, {
  contentType: 'image/png',
  upsert: false,
});
if (upErr) { console.log('❌ UPLOAD:', upErr.message); process.exit(1); }
console.log('✅ Upload OK:', path);

const { data } = supabase.storage.from('menu-images').getPublicUrl(path);
const res = await fetch(data.publicUrl);
console.log(res.ok ? `✅ Lectura pública OK (HTTP ${res.status})` : `❌ Lectura pública falló (HTTP ${res.status})`);

const { error: rmErr } = await supabase.storage.from('menu-images').remove([path]);
console.log(rmErr ? `❌ REMOVE: ${rmErr.message}` : '✅ Remove OK (limpieza completa)');