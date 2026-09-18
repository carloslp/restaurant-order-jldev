-- Migration: vincular auth.users ↔ staff explícitamente
-- Ejecutar en SQL Editor de Supabase

-- 1. Agregar columna auth_user_id a staff
ALTER TABLE staff
ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Función para vincular staff existente por email
CREATE OR REPLACE FUNCTION public.link_staff_to_auth()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE staff s
  SET auth_user_id = u.id
  FROM auth.users u
  WHERE s.auth_user_id IS NULL
    AND s.email = u.email;
END;
$$;

-- 3. Ejecutar vinculación para staff existente
SELECT public.link_staff_to_auth();

-- 4. Trigger: al insertar/actualizar staff, vincular automáticamente si coincide email
CREATE OR REPLACE FUNCTION public.staff_sync_auth_user()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.auth_user_id IS NULL AND NEW.email IS NOT NULL THEN
    SELECT id INTO NEW.auth_user_id
    FROM auth.users
    WHERE email = NEW.email
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_staff_sync_auth_user ON staff;
CREATE TRIGGER trigger_staff_sync_auth_user
BEFORE INSERT OR UPDATE ON staff
FOR EACH ROW EXECUTE FUNCTION public.staff_sync_auth_user();

-- 5. Trigger inverso: al crear usuario auth, si hay staff pendiente con ese email, vincularlo
CREATE OR REPLACE FUNCTION public.auth_user_sync_staff()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE staff
  SET auth_user_id = NEW.id
  WHERE auth_user_id IS NULL
    AND email = NEW.email;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auth_user_sync_staff ON auth.users;
CREATE TRIGGER trigger_auth_user_sync_staff
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.auth_user_sync_staff();

-- 6. Índice para consultas rápidas por auth_user_id
CREATE INDEX IF NOT EXISTS idx_staff_auth_user_id ON staff(auth_user_id);

-- 7. Comentario para documentación
COMMENT ON COLUMN staff.auth_user_id IS 'Referencia a auth.users.id para vinculación directa y consultas sin depender de email';