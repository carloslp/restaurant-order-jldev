-- ============================================================================
-- fix-realtime-caja.sql
-- Hace visible el pedido nuevo en Caja (/staff/caja) y KDS (/staff/kds) y
-- habilita el realtime "en vivo".
--
-- Síntoma: el pedido creado desde el checkout (status CREADO) no aparecía en
-- Caja. Causas posibles del lado de la BD:
--   1) `orders` no está en la publication supabase_realtime → los eventos
--      INSERT/UPDATE de postgres_changes nunca llegan al browser.
--   2) Faltan GRANT de SELECT para el rol `authenticated` (orders y la vista
--      staff_orders_view). Sin GRANT la policy nunca se evalúa (GRANT =
--      privilegio base; POLICY = qué filas).
--   3) Falta la policy orders_staff_live (SELECT por JWT del staff).
--
-- Nota: desde v0.6.0 la carga inicial de Caja/KDS va por server action
-- (listOrdersForLocation) y no depende de nada de esto; este script habilita
-- la capa "en vivo" (Realtime) y deja consistente la BD.
--
-- Todo es idempotente: se puede re-ejecutar sin daño.
-- Ejecutar en: Supabase Dashboard → SQL Editor.
-- ============================================================================

-- 1. Realtime habilitado para `orders` (publication supabase_realtime).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END $$;

-- 2. GRANT de SELECT para el staff autenticado (privilegio base de la policy).
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON TABLE public.orders TO authenticated;

-- 2b. staff_orders_view (solo si existe: docs/view-staff-orders.sql o
--     docs/migration-driver-id.sql). security_invoker=true aplica el RLS de
--     orders, así que el GRANT no expone nada que RLS no filtre ya.
DO $$
BEGIN
  IF to_regclass('public.staff_orders_view') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON public.staff_orders_view TO authenticated';
  END IF;
END $$;

-- 3. Policy de SELECT por JWT para Realtime.
--    Permite SELECT si location_id coincide con el GUC app.local_id (flujo servidor)
--    o si el usuario autenticado pertenece a este local en public.staff (flujo browser/Realtime).
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

-- 4. Verificación:
--    4a. Debe devolver true:
SELECT EXISTS (
  SELECT 1 FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'orders'
) AS orders_in_publication;

--    4b. Debe devolver anon_select = false, authenticated_select = true:
SELECT
  has_table_privilege('anon', 'orders', 'SELECT') AS anon_select,
  has_table_privilege('authenticated', 'orders', 'SELECT') AS authenticated_select;

--    4c. Debe listar la policy orders_staff_live:
SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'orders' AND policyname = 'orders_staff_live';

-- NOTA (JWT del staff): el claim user_metadata.location_id lo re-escribe el
-- login (src/features/staff/auth.ts → updateUserById + refreshSession). Si un
-- usuario de staff fue creado antes de que existiera ese código, cerrar sesión
-- y volver a entrar una vez para refrescar el JWT.
-- ============================================================================
