-- ============================================================================
-- docs/fix-supabase-linter-warnings.sql
-- Remediación de Advertencias del Supabase Database Linter:
--
-- 1. function_search_path_mutable:
--    - update_updated_at_column
--    - link_staff_to_auth
--    - get_available_tables
--
-- 2. anon_security_definer_function_executable & authenticated_security_definer_function_executable:
--    - auth_user_sync_staff (trigger)
--    - staff_sync_auth_user (trigger)
--    - get_available_tables (solo backend service_role)
--
-- 3. rls_policy_always_true:
--    - public.audit_log (audit_log_service_all: innecesaria, service_role ya salta RLS)
--    - public.waitlist (waitlist_public_insert y waitlist_update: las operaciones
--      se realizan vía Server Actions con service_role; no exponer mutaciones directas a anon)
--
-- 4. extension_in_public:
--    - pg_net: mover de schema public a extensions
--
-- Ejecutar en: Supabase Dashboard -> SQL Editor
-- Es idempotente: puede ejecutarse múltiples veces sin errores.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Fijar search_path en funciones (function_search_path_mutable)
-- ----------------------------------------------------------------------------

-- 1.1 update_updated_at_column
ALTER FUNCTION public.update_updated_at_column() 
  SET search_path = public, pg_temp;

-- 1.2 link_staff_to_auth
ALTER FUNCTION public.link_staff_to_auth() 
  SET search_path = public, auth, pg_temp;

-- 1.3 get_available_tables
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid 
    WHERE n.nspname = 'public' AND p.proname = 'get_available_tables'
  ) THEN
    ALTER FUNCTION public.get_available_tables(uuid, date, time, time, integer, text) 
      SET search_path = public, pg_temp;
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 2. Revocar privilegios EXECUTE públicos en funciones SECURITY DEFINER
--    (anon_security_definer_function_executable & authenticated_security_definer_function_executable)
-- ----------------------------------------------------------------------------

-- 2.1 auth_user_sync_staff (función interna de trigger en auth.users)
REVOKE EXECUTE ON FUNCTION public.auth_user_sync_staff() FROM PUBLIC, anon, authenticated;

-- 2.2 staff_sync_auth_user (función interna de trigger en public.staff)
REVOKE EXECUTE ON FUNCTION public.staff_sync_auth_user() FROM PUBLIC, anon, authenticated;

-- 2.3 get_available_tables (invocada exclusivamente por Server Actions con service_role)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid 
    WHERE n.nspname = 'public' AND p.proname = 'get_available_tables'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.get_available_tables(uuid, date, time, time, integer, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.get_available_tables(uuid, date, time, time, integer, text) TO service_role;
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 3. Eliminar políticas RLS excesivamente permisivas (rls_policy_always_true)
-- ----------------------------------------------------------------------------

-- 3.1 audit_log: service_role ya salta RLS automáticamente; la policy pública con USING(true) es innecesaria y peligrosa
DROP POLICY IF EXISTS audit_log_service_all ON public.audit_log;

-- 3.2 waitlist: joinPublicWaitlist y cancelPublicWaitlist corren en Node vía Server Actions con service_role.
-- Eliminar políticas de mutación directa anónima sobre waitlist.
DROP POLICY IF EXISTS waitlist_public_insert ON public.waitlist;
DROP POLICY IF EXISTS waitlist_update ON public.waitlist;

-- Revocar permisos directos de escritura al rol anon sobre la tabla waitlist
REVOKE INSERT, UPDATE, DELETE ON TABLE public.waitlist FROM anon;
GRANT SELECT ON TABLE public.waitlist TO anon; -- Solo lectura (para suscripción Realtime)
GRANT ALL ON TABLE public.waitlist TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 4. Mover extensión pg_net fuera de public (extension_in_public)
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_net'
  ) THEN
    ALTER EXTENSION pg_net SET SCHEMA extensions;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_net no requiere reubicación o no tiene soporte para ALTER EXTENSION SET SCHEMA: %', SQLERRM;
END $$;
