-- Bucket de imágenes del menú en Supabase Storage.
-- Referencia para producción. En desarrollo, scripts/setup-menu-images-bucket.mjs
-- lo crea automáticamente con la Storage API (no hace falta SQL Editor).
-- Run in Supabase → SQL Editor (como postgres).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'menu-images',
    'menu-images',
    true,                                  -- URLs públicas para el menú
    5242880,                               -- 5MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
    SET public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

-- NOTA: los uploads los hace el server con la secret key (service role), que salta
-- las policies de storage; la lectura es pública por ser bucket público. Por eso
-- no se requieren policies adicionales en storage.objects.

-- Estructura de archivos dentro del bucket:
--   {location_id}/categories/{uuid}.{ext}
--   {location_id}/products/{uuid}.{ext}