-- ============================================================================
-- fix-auth-user-sync-staff.sql
-- Corrige el fallo de creacion de usuarios: "Database error creating new user"
--   (HTTP 500, AuthRetryableFetchError) en /setup y en la invitacion de staff.
--
-- Causa raiz (verificada): el trigger trigger_auth_user_sync_staff
--   (AFTER INSERT ON auth.users) ejecuta public.auth_user_sync_staff() en
--   modo SECURITY INVOKER. El INSERT lo hace el rol supabase_auth_admin
--   (servicio GoTrue), que NO tiene privilegios sobre public.staff:
--     permission denied for table staff (42501)
--   -> la transaccion del INSERT se revierte
--   -> GoTrue responde "Database error creating new user" (HTTP 500)
--   -> supabase-js lo clasifica como AuthRetryableFetchError.
--   Afectaba a /setup (initializeSystem) y a inviteStaff (staff.ts).
--
-- Solucion (patron oficial de Supabase para triggers sobre auth.users):
--   1. SECURITY DEFINER: la funcion corre como su dueno (postgres), que
--      tiene acceso completo a public.staff.
--   2. SET search_path = '': en contexto definer se bloquea el search_path
--      (anti hijacking); nombres de tablas siempre calificados.
--   3. Fail-soft: un fallo de vinculacion queda como WARNING en los logs de
--      Postgres y NO aborta la creacion del usuario. La app ya vincula
--      explicitamente auth_user_id (setup.ts / staff.ts) y hay fallback
--      por email en getCurrentStaff.
--
-- Idempotente (CREATE OR REPLACE + DROP IF EXISTS).
-- Ejecutar en: Supabase Dashboard -> SQL Editor.
-- ============================================================================

-- 1. Trigger inverso (el causante): al crear usuario auth, vincular staff
--    pendiente por email.
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
    -- No bloquear la creacion del usuario por un fallo de vinculacion;
    -- la app hace el vinculo explicito tras crear el usuario.
    RAISE WARNING 'auth_user_sync_staff: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- 2. Trigger directo (hardening): al insertar/actualizar staff, vincular si
--    coincide email. Tambien SECURITY DEFINER para no depender de los GRANTs
--    del rol que ejecute el insert (el acceso a auth.users ya no depende del
--    invocador).
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

-- 3. Recrear triggers (DROP IF EXISTS para cubrir cualquier estado previo)
DROP TRIGGER IF EXISTS trigger_auth_user_sync_staff ON auth.users;
CREATE TRIGGER trigger_auth_user_sync_staff
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.auth_user_sync_staff();

DROP TRIGGER IF EXISTS trigger_staff_sync_auth_user ON staff;
CREATE TRIGGER trigger_staff_sync_auth_user
BEFORE INSERT OR UPDATE ON staff
FOR EACH ROW EXECUTE FUNCTION public.staff_sync_auth_user();

-- 4. Verificacion: ambas filas deben mostrar security_definer = true.
--    Tras ejecutar, reintenta /setup: el admin debe crearse sin el error 500.
SELECT proname, prosecdef AS security_definer
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('auth_user_sync_staff', 'staff_sync_auth_user')
ORDER BY proname;