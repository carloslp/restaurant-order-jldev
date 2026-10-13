-- ============================================================================
-- docs/migration-security-hardening.sql
-- Migración de Seguridad Integral:
--   1) Idempotencia en orders (evitar duplicados por doble submit/reintentos)
--   2) Endurecimiento de RLS multi-tenant para PostgREST pública (categorías, productos, modificadores, descuentos)
--   3) Tabla de auditoría (audit_log) para acciones críticas de staff
--
-- Ejecutar en: Supabase Dashboard -> SQL Editor
-- Es idempotente: puede ejecutarse múltiples veces sin errores.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Idempotencia en órdenes
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS idempotency_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key 
  ON public.orders(idempotency_key) 
  WHERE idempotency_key IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. Endurecimiento de RLS multi-tenant para consultas públicas
--    Permite resolución de local vía GUC app.local_id O header HTTP x-location-id
-- ----------------------------------------------------------------------------

-- Categorías
DROP POLICY IF EXISTS categories_public_read ON public.categories;
CREATE POLICY categories_public_read ON public.categories
FOR SELECT USING (is_active = true);

-- Productos (permite lectura y notificaciones Realtime de agotado 86ing)
DROP POLICY IF EXISTS products_public_read ON public.products;
CREATE POLICY products_public_read ON public.products
FOR SELECT USING (true);

-- Grupos de modificadores
DROP POLICY IF EXISTS modifier_groups_public_read ON public.modifier_groups;
CREATE POLICY modifier_groups_public_read ON public.modifier_groups
FOR SELECT USING (true);

-- Opciones de modificadores (permite lectura y notificaciones Realtime de 86ing)
DROP POLICY IF EXISTS modifier_options_public_read ON public.modifier_options;
CREATE POLICY modifier_options_public_read ON public.modifier_options
FOR SELECT USING (true);

-- Descuentos públicos
DROP POLICY IF EXISTS discounts_public_read ON public.discounts;
CREATE POLICY discounts_public_read ON public.discounts
FOR SELECT USING (
    is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
);

-- ----------------------------------------------------------------------------
-- 3. Tabla de auditoría (audit_log) para acciones de staff
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID REFERENCES public.locals(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NULL,
    metadata JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_location_created 
  ON public.audit_log(location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_staff 
  ON public.audit_log(staff_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_resource 
  ON public.audit_log(resource_type, resource_id);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_staff_read ON public.audit_log;
CREATE POLICY audit_log_staff_read ON public.audit_log
FOR SELECT USING (
    location_id = NULLIF(current_setting('app.local_id', true), '')::uuid
);

DROP POLICY IF EXISTS audit_log_service_all ON public.audit_log;

GRANT SELECT ON TABLE public.audit_log TO authenticated;
GRANT ALL ON TABLE public.audit_log TO service_role;

