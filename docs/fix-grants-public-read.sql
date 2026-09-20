-- ============================================================================
-- fix-grants-public-read.sql
-- Corrige el fallo del menú público: 401 / code 42501
--   "permission denied for table categories|products|modifier_groups|..."
--
-- Causa: en proyectos con API keys nuevas (sb_publishable_*), las tablas
-- creadas vía SQL Editor NO heredan los privilegios por defecto del rol anon.
-- Las policies RLS estaban bien, pero nunca se evalúan si el rol no tiene el
-- privilegio base. Regla de Supabase:
--   GRANT  = privilegio BASE (el rol puede tocar la tabla)
--   POLICY = qué FILAS ve (RLS; ya definidas en docs/install.sql §6)
-- Dar SELECT NO expone nada nuevo: RLS sigue filtrando is_active/is_available.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor. Idempotente (GRANT es no-op
-- si ya existe). Tras ejecutarlo, recarga /{slug} y verifica /api/health.
-- ============================================================================

-- 1. Uso del esquema: requerido para cualquier consulta en public
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- 2. Lectura pública: tablas que YA tienen policy *_public_read
--    (menú completo, aforo por zona, promos activas, datos maestros
--    NOM-050 de alérgenos/etiquetas y sus vínculos por producto)
GRANT SELECT ON TABLE
    categories,
    products,
    modifier_groups,
    modifier_options,
    allergens,
    diet_labels,
    product_allergens,
    product_diet_labels,
    discounts,
    local_zone_capacity
TO anon, authenticated;

-- 3. locals: solo ping de conectividad (/api/health). No hay policy de
--    lectura pública en locals, así que anon ve 0 filas: el público NO puede
--    enumerar locales (diseño intencional; getLocalBySlug usa service role).
GRANT SELECT ON TABLE locals TO anon, authenticated;

-- 4. orders: solo el rol authenticated (JWT de staff) para Realtime
--    postgres_changes vía policy orders_staff_live
--    (docs/policy-realtime-staff.sql). El anon NO obtiene acceso a orders.
GRANT SELECT ON TABLE orders TO authenticated;

-- 5. Verificación: debe listar las tablas de arriba con anon_select = true;
--    orders/staff/delivery_tokens/etc. siguen en false.
SELECT table_name, has_table_privilege('anon', table_name, 'SELECT') AS anon_select
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;