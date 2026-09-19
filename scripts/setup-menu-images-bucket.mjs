// Crea (una vez) el bucket público de imágenes del menú en Supabase Storage.
// Uso: node --env-file=.env scripts/setup-menu-images-bucket.mjs
// Idempotente: si el bucket ya existe, no lo toca.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !secret) {
  console.log('FALTA SUPABASE_URL / SUPABASE_SECRET_KEY');
  process.exit(1);
}

const supabase = createClient(url, secret, { auth: { persistSession: false } });

const BUCKET = 'menu-images';
const { data: buckets, error: listError } = await supabase.storage.listBuckets();

if (listError) {
  console.log('ERROR listando buckets:', listError.message);
  process.exit(1);
}

const existing = buckets?.find((b) => b.id === BUCKET);

if (existing) {
  console.log(`✅ El bucket "${BUCKET}" ya existe (public=${existing.public}). Nada que crear.`);
} else {
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true, // URLs públicas para el menú
    fileSizeLimit: 5 * 1024 * 1024, // 5MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  });

  if (error) {
    console.log('ERROR creando bucket:', error.message);
    process.exit(1);
  }
  console.log(`✅ Bucket "${BUCKET}" creado (public=true, 5MB, jpeg/png/webp).`);
}

// Verificación de subida/lectura opcional no necesaria: el server usa service role.
console.log(`Listo. Las imágenes vivirán en: ${BUCKET}/{location_id}/categories|products/{uuid}.{ext}`);