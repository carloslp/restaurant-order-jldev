-- ============================================================================
-- docs/apply-all-fixes.sql
-- ============================================================================
-- CONSOLIDADO DE REPARACIONES Y MIGRACIONES PARA LA BASE DE DATOS
-- ============================================================================
-- Diseñado para aplicarse en una base de datos EXISTENTE en producción o desarrollo
-- a través del SQL Editor de Supabase (rol postgres).
--
-- Integra y consolida en un solo paso idempotente:
--   1. fix-orders-constraints.sql       (Elimina constraints incompatibles de orders)
--   2. fix-auth-user-sync-staff.sql     (Corrige HTTP 500 al crear auth user/admin)
--   3. fix-grants-public-read.sql       (Corrige 401/42501 en menú público)
--   4. fix-realtime-caja.sql            (Habilita eventos en vivo para Caja y KDS)
--   5. fix-supabase-linter-warnings.sql (Remedia advertencias del linter de Supabase)
--   6. Nuevas columnas y optimizaciones de migraciones recientes:
--      - Modo catálogo y switch de reservas en locals (is_catalog_only, reservations_enabled)
--      - Asignación de repartidor (driver_id) e idempotencia en orders
--      - Mesas combinadas para grupos grandes (table_ids) en reservations y waitlist
--      - Función RPC optimizada get_available_tables con seguridad endurecida
--      - Aforo dinámico por zona (local_zone_capacity como vista calculada)
--      - Vista staff_orders_view actualizada
--      - Publicación supabase_realtime para orders, products y waitlist
--
-- Totalmente IDEMPOTENTE: puede ejecutarse múltiples veces de forma segura.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CORRECCIÓN DE CONSTRAINTS EN ORDERS (fix-orders-constraints.sql)
-- ----------------------------------------------------------------------------
-- Elimina constraints obsoletos que bloqueaban pedidos retrasados o con promociones/descuentos.
ALTER TABLE public.orders 
  DROP CONSTRAINT IF EXISTS chk_eta_future;

ALTER TABLE public.orders 
  DROP CONSTRAINT IF EXISTS chk_total_consistency;

-- Actualiza validación de direcciones para admitir consumo en salón ('EN_MESA')
ALTER TABLE public.orders 
  DROP CONSTRAINT IF EXISTS chk_delivery_address;

ALTER TABLE public.orders 
  ADD CONSTRAINT chk_delivery_address CHECK (
    (order_type = 'DOMICILIO' AND delivery_address IS NOT NULL) OR
    (order_type = 'RECOGER' AND delivery_address IS NULL) OR
    (order_type = 'EN_MESA' AND delivery_address IS NULL)
  );


-- ----------------------------------------------------------------------------
-- 2. RECONCILIACIÓN DE COLUMNAS RECIENTES EN TABLAS EXISTENTES
-- ----------------------------------------------------------------------------

-- 2.1 locals: modo catálogo y pausa de reservas
ALTER TABLE public.locals 
  ADD COLUMN IF NOT EXISTS is_catalog_only BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reservations_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS address TEXT NULL,
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7) NULL,
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7) NULL;

-- 2.2 orders: repartidor, idempotencia, mesa física, comanda QR y notas
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key UUID NULL,
  ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS session_id UUID NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT NULL;

-- 2.3 reservations: mesas combinadas (table_ids) y mesa individual
ALTER TABLE public.reservations 
  ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS table_ids UUID[] NOT NULL DEFAULT '{}';

-- 2.4 waitlist (si existe): mesas combinadas (table_ids)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'waitlist') THEN
    ALTER TABLE public.waitlist 
      ADD COLUMN IF NOT EXISTS table_ids UUID[] NOT NULL DEFAULT '{}';
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 3. ÍNDICES DE RENDIMIENTO Y BÚSQUEDA RÁPIDA
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key 
  ON public.orders(idempotency_key) 
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_driver 
  ON public.orders(driver_id);

CREATE INDEX IF NOT EXISTS idx_orders_table_id 
  ON public.orders(table_id);

CREATE INDEX IF NOT EXISTS idx_reservations_table_id 
  ON public.reservations(table_id);

CREATE INDEX IF NOT EXISTS idx_reservations_table_ids_gin 
  ON public.reservations USING GIN (table_ids);

CREATE INDEX IF NOT EXISTS idx_reservations_table_date_status 
  ON public.reservations (table_id, reservation_date, status);

CREATE INDEX IF NOT EXISTS idx_restaurant_tables_location_zone_active 
  ON public.restaurant_tables (location_id, zone, is_active);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'waitlist') THEN
    CREATE INDEX IF NOT EXISTS idx_waitlist_table_ids_gin 
      ON public.waitlist USING GIN (table_ids);
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 4. VINCULACIÓN Y TRIGGERS AUTH <-> STAFF (fix-auth-user-sync-staff.sql)
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER + search_path bloqueado para evitar error HTTP 500
-- de GoTrue (supabase_auth_admin) al registrar usuarios.

CREATE OR REPLACE FUNCTION public.auth_user_sync_staff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    UPDATE public.staff
    SET auth_user_id = NEW.id
    WHERE auth_user_id IS NULL
      AND email = NEW.email;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'auth_user_sync_staff: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_sync_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.auth_user_id IS NULL AND NEW.email IS NOT NULL THEN
    SELECT u.id INTO NEW.auth_user_id
    FROM auth.users u
    WHERE u.email = NEW.email
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auth_user_sync_staff ON auth.users;
CREATE TRIGGER trigger_auth_user_sync_staff
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.auth_user_sync_staff();

DROP TRIGGER IF EXISTS trigger_staff_sync_auth_user ON public.staff;
CREATE TRIGGER trigger_staff_sync_auth_user
BEFORE INSERT OR UPDATE ON public.staff
FOR EACH ROW EXECUTE FUNCTION public.staff_sync_auth_user();

REVOKE EXECUTE ON FUNCTION public.auth_user_sync_staff() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.staff_sync_auth_user() FROM PUBLIC, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 5. CONVERSIÓN SEGURA DE local_zone_capacity A VISTA DINÁMICA
-- ----------------------------------------------------------------------------
-- Si antes era una tabla física estática, la sustituimos de forma segura por una vista
-- calculada en tiempo real basada en restaurant_tables.
DO $$
DECLARE
  v_relkind "char";
BEGIN
  SELECT c.relkind INTO v_relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'local_zone_capacity'
    AND n.nspname = 'public';

  IF v_relkind = 'r' THEN
    -- Era una tabla física: eliminarla con sus policies obsoletas
    EXECUTE 'DROP TABLE public.local_zone_capacity CASCADE';
  ELSIF v_relkind = 'v' THEN
    -- Ya era una vista
    EXECUTE 'DROP VIEW public.local_zone_capacity CASCADE';
  END IF;

  -- Eliminar zone_capacities si existiera de versiones anteriores
  SELECT c.relkind INTO v_relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'zone_capacities'
    AND n.nspname = 'public';

  IF v_relkind = 'r' THEN
    EXECUTE 'DROP TABLE public.zone_capacities CASCADE';
  ELSIF v_relkind = 'v' THEN
    EXECUTE 'DROP VIEW public.zone_capacities CASCADE';
  END IF;
END $$;

CREATE VIEW public.local_zone_capacity
WITH (security_invoker = true)
AS
SELECT 
    location_id,
    zone,
    COALESCE(SUM(max_capacity), 0)::INTEGER AS capacity
FROM public.restaurant_tables
WHERE is_active = TRUE
GROUP BY location_id, zone;

GRANT SELECT ON public.local_zone_capacity TO anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 6. RPC: FUNCIÓN get_available_tables ENDURECIDA Y CON MESAS COMBINADAS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_available_tables(
    p_location_id UUID,
    p_date DATE,
    p_start_time TIME,
    p_end_time TIME,
    p_party_size INT,
    p_zone TEXT DEFAULT NULL
)
RETURNS TABLE (
    table_id UUID,
    table_number TEXT,
    min_capacity INT,
    max_capacity INT,
    zone TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id AS table_id,
        t.table_number,
        t.min_capacity,
        t.max_capacity,
        t.zone
    FROM restaurant_tables t
    WHERE t.location_id = p_location_id
      AND t.is_active = TRUE
      AND (p_zone IS NULL OR t.zone = p_zone)
      AND p_party_size BETWEEN t.min_capacity AND t.max_capacity
      AND t.id NOT IN (
          -- Mesas bloqueadas como mesa principal
          SELECT r.table_id
          FROM reservations r
          WHERE r.table_id IS NOT NULL
            AND r.reservation_date = p_date
            AND r.status IN ('PENDIENTE', 'CONFIRMADA')
            AND (
                r.reservation_time < p_end_time 
                AND (r.reservation_time + INTERVAL '90 minutes')::TIME > p_start_time
            )
          UNION
          -- Mesas bloqueadas dentro de un grupo combinado (table_ids)
          SELECT unnest(r.table_ids)
          FROM reservations r
          WHERE r.table_ids IS NOT NULL 
            AND array_length(r.table_ids, 1) > 0
            AND r.reservation_date = p_date
            AND r.status IN ('PENDIENTE', 'CONFIRMADA')
            AND (
                r.reservation_time < p_end_time 
                AND (r.reservation_time + INTERVAL '90 minutes')::TIME > p_start_time
            )
      )
    ORDER BY t.max_capacity ASC, t.table_number ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_available_tables(UUID, DATE, TIME, TIME, INT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_tables(UUID, DATE, TIME, TIME, INT, TEXT) TO service_role;
COMMENT ON FUNCTION public.get_available_tables IS 'Retorna mesas físicas activas sin reservas solapadas que admiten el tamaño del grupo solicitado.';


-- ----------------------------------------------------------------------------
-- 7. VISTA SEGURA staff_orders_view (KDS/Caja)
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.staff_orders_view;

CREATE VIEW public.staff_orders_view
WITH (security_invoker = true)
AS
SELECT
    o.id,
    o.location_id,
    o.customer_name,
    o.order_type,
    o.payment_method,
    CASE
        WHEN o.order_type = 'DOMICILIO' AND o.delivery_address IS NOT NULL
        THEN o.delivery_address
        ELSE NULL
    END AS delivery_address_short,
    o.eta,
    o.status,
    o.payment_status,
    o.subtotal,
    o.iva_amount,
    o.delivery_fee_amount,
    o.total,
    o.cart_snapshot,
    o.delivery_zone,
    o.driver_id,
    o.table_id,
    o.session_id,
    o.delivered_at,
    o.created_at,
    o.updated_at
FROM public.orders o;

GRANT SELECT ON public.staff_orders_view TO anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 8. ENDURECIMIENTO DE POLÍTICAS RLS (Realtime, PostgREST, Linter)
-- ----------------------------------------------------------------------------

-- 8.1 Realtime de órdenes para staff autenticado (fix-realtime-caja.sql / fix-linter)
DROP POLICY IF EXISTS orders_staff_live ON public.orders;

CREATE POLICY orders_staff_live ON public.orders
FOR SELECT
TO authenticated
USING (
    location_id = NULLIF(current_setting('app.local_id', true), '')::uuid
    OR EXISTS (
        SELECT 1 FROM public.staff 
        WHERE staff.auth_user_id = auth.uid() 
          AND staff.location_id = orders.location_id
    )
);

-- 8.2 Limpieza de policies obsoletas o excesivamente permisivas (fix-supabase-linter-warnings.sql)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_log') THEN
    DROP POLICY IF EXISTS audit_log_service_all ON public.audit_log;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'waitlist') THEN
    DROP POLICY IF EXISTS waitlist_public_insert ON public.waitlist;
    DROP POLICY IF EXISTS waitlist_update ON public.waitlist;
  END IF;
END $$;

-- 8.3 Políticas de lectura pública del catálogo y Realtime 86ing
DROP POLICY IF EXISTS categories_public_read ON public.categories;
CREATE POLICY categories_public_read ON public.categories
FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS products_public_read ON public.products;
CREATE POLICY products_public_read ON public.products
FOR SELECT USING (true);

DROP POLICY IF EXISTS modifier_groups_public_read ON public.modifier_groups;
CREATE POLICY modifier_groups_public_read ON public.modifier_groups
FOR SELECT USING (true);

DROP POLICY IF EXISTS modifier_options_public_read ON public.modifier_options;
CREATE POLICY modifier_options_public_read ON public.modifier_options
FOR SELECT USING (true);

DROP POLICY IF EXISTS discounts_public_read ON public.discounts;
CREATE POLICY discounts_public_read ON public.discounts
FOR SELECT USING (
    is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
);


-- ----------------------------------------------------------------------------
-- 9. PRIVILEGIOS Y GRANTS BASE (fix-grants-public-read.sql)
-- ----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Menú y datos maestros para catálogo público
GRANT SELECT ON TABLE
    public.categories,
    public.products,
    public.modifier_groups,
    public.modifier_options,
    public.allergens,
    public.diet_labels,
    public.product_allergens,
    public.product_diet_labels,
    public.discounts
TO anon, authenticated;

-- locals: anon solo para ping de salud (RLS filtra filas sin GUC)
GRANT SELECT ON TABLE public.locals TO anon, authenticated;

-- orders: autenticado para Realtime de staff; anon NO tiene acceso
GRANT SELECT ON TABLE public.orders TO authenticated;

-- Mesas y turnos
GRANT SELECT ON public.restaurant_tables TO anon, authenticated;
GRANT ALL ON public.restaurant_tables TO authenticated, service_role;

GRANT SELECT ON public.local_shifts TO anon, authenticated;
GRANT ALL ON public.local_shifts TO authenticated, service_role;

-- waitlist: anon solo SELECT para Realtime de comensales en espera
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'waitlist') THEN
    REVOKE INSERT, UPDATE, DELETE ON TABLE public.waitlist FROM anon;
    GRANT SELECT ON TABLE public.waitlist TO anon;
    GRANT ALL ON TABLE public.waitlist TO authenticated, service_role;
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 10. REMEDIACIONES ADICIONALES DE FUNCIONES (fix-supabase-linter-warnings.sql)
-- ----------------------------------------------------------------------------

-- Fijar search_path en funciones utilitarias
ALTER FUNCTION public.update_updated_at_column() 
  SET search_path = public, pg_temp;

ALTER FUNCTION public.link_staff_to_auth() 
  SET search_path = public, auth, pg_temp;

REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_staff_to_auth() FROM PUBLIC, anon, authenticated;

-- Reubicar pg_net en schema extensions si se encuentra en public
CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_net' AND extnamespace = 'public'::regnamespace
  ) THEN
    ALTER EXTENSION pg_net SET SCHEMA extensions;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;


-- ----------------------------------------------------------------------------
-- 11. HABILITAR PUBLICACIÓN SUPABASE_REALTIME
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'products'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'waitlist') THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'waitlist'
      ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.waitlist;
      END IF;
    END IF;
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 12. TABLA DE AUDITORÍA (audit_log)
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

CREATE INDEX IF NOT EXISTS idx_audit_log_location_created ON public.audit_log(location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_staff ON public.audit_log(staff_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON public.audit_log(resource_type, resource_id);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_staff_read ON public.audit_log;
CREATE POLICY audit_log_staff_read ON public.audit_log
FOR SELECT USING (
    location_id = NULLIF(current_setting('app.local_id', true), '')::uuid
);

GRANT SELECT ON TABLE public.audit_log TO authenticated;
GRANT ALL ON TABLE public.audit_log TO service_role;


-- ----------------------------------------------------------------------------
-- 13. CONFIGURACIÓN DEL BUCKET STORAGE (menu-images)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
        'menu-images',
        'menu-images',
        true,
        5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp']
    )
    ON CONFLICT (id) DO UPDATE
        SET public = EXCLUDED.public,
            file_size_limit = EXCLUDED.file_size_limit,
            allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END $$;

-- ============================================================================
-- VERIFICACIÓN FINAL
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '¡Script docs/apply-all-fixes.sql ejecutado con éxito!';
END $$;
