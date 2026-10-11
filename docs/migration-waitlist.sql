-- ============================================================================
-- docs/migration-waitlist.sql
-- Tabla y configuración para el Sistema de Fila de Espera Virtual (Waitlist)
-- Convive de forma limpia con restaurant_tables y reservations.
--
-- Ejecutar en: Supabase Dashboard -> SQL Editor (proyecto zxzztclmmobsgabaarns).
-- Idempotente: se puede re-ejecutar sin daño.
-- ============================================================================

-- 1. Tipo ENUM para el estado en fila
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waitlist_status') THEN
    CREATE TYPE waitlist_status AS ENUM (
      'EN_ESPERA',    -- Esperando turno fuera del restaurante
      'LLAMADO',      -- Notificado de que su mesa está lista (con tolerancia)
      'SENTADO',      -- Sentado en la mesa física
      'CANCELADO',    -- Cliente canceló por su cuenta
      'NO_SHOW'       -- No se presentó tras el llamado
    );
  END IF;
END $$;

-- 2. Tabla waitlist
CREATE TABLE IF NOT EXISTS public.waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES public.locals(id) ON DELETE CASCADE,
    table_id UUID NULL REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    party_size INTEGER NOT NULL CHECK (party_size > 0),
    preferred_zone TEXT NOT NULL DEFAULT 'CUALQUIERA' CHECK (preferred_zone IN ('INTERIOR', 'TERRAZA', 'BARRA', 'CUALQUIERA')),
    status waitlist_status NOT NULL DEFAULT 'EN_ESPERA',
    tracking_token UUID NOT NULL DEFAULT gen_random_uuid(),
    estimated_wait_minutes INTEGER NULL,
    called_at TIMESTAMPTZ NULL,
    seated_at TIMESTAMPTZ NULL,
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NULL REFERENCES public.staff(id) ON DELETE SET NULL,
    updated_by UUID NULL REFERENCES public.staff(id) ON DELETE SET NULL
);

-- 3. Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_waitlist_location_status ON public.waitlist(location_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_tracking_token ON public.waitlist(tracking_token);

-- 4. Habilitar Realtime para actualizaciones en vivo en el móvil del cliente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'waitlist'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.waitlist;
  END IF;
END $$;

-- 5. Privilegios de acceso para autenticado y anónimo
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.waitlist TO anon;
GRANT ALL ON TABLE public.waitlist TO authenticated;

-- RLS
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Política de lectura pública por tracking_token (para la pantalla de seguimiento del cliente)
DROP POLICY IF EXISTS waitlist_public_read ON public.waitlist;
CREATE POLICY waitlist_public_read ON public.waitlist
FOR SELECT
USING (true);

-- Política de inserción pública (para que el cliente se forme desde el QR en la puerta)
DROP POLICY IF EXISTS waitlist_public_insert ON public.waitlist;
CREATE POLICY waitlist_public_insert ON public.waitlist
FOR INSERT
WITH CHECK (true);

-- Política de actualización para staff o vía tracking_token (para cancelar turno)
DROP POLICY IF EXISTS waitlist_update ON public.waitlist;
CREATE POLICY waitlist_update ON public.waitlist
FOR UPDATE
USING (true)
WITH CHECK (true);
