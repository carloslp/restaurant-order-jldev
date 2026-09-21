-- ============================================================================
-- MIGRACIÓN: GESTIÓN DE MESAS, TURNOS MÚLTIPLES Y PEDIDOS QR CON COMANDAS
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================================

-- 1. Tipos Enum
DO $$
BEGIN
    -- Extender tipo de orden para soportar consumo en salón
    BEGIN
        ALTER TYPE order_type ADD VALUE IF NOT EXISTS 'EN_MESA';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    -- Estados operativos de la mesa física
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'table_status') THEN
        CREATE TYPE table_status AS ENUM ('LIBRE', 'RESERVADA', 'OCUPADA', 'EN_LIMPIEZA');
    END IF;

    -- Estado de la sesión de comanda QR en la mesa
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'qr_status') THEN
        CREATE TYPE qr_status AS ENUM ('INACTIVO', 'ABIERTO');
    END IF;
END $$;

-- 2. Tabla de Mesas Físicas del Restaurante
CREATE TABLE IF NOT EXISTS restaurant_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locals(id) ON DELETE CASCADE,
    zone TEXT NOT NULL CHECK (zone IN ('INTERIOR', 'TERRAZA', 'BARRA')),
    table_number TEXT NOT NULL,
    min_capacity INTEGER NOT NULL DEFAULT 1 CHECK (min_capacity > 0),
    max_capacity INTEGER NOT NULL CHECK (max_capacity >= min_capacity),
    is_active BOOLEAN NOT NULL DEFAULT true,
    status table_status NOT NULL DEFAULT 'LIBRE',
    qr_status qr_status NOT NULL DEFAULT 'INACTIVO',
    qr_token TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    current_session_id UUID NULL,
    current_guests INTEGER NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(location_id, table_number)
);

-- 3. Tabla de Turnos y Horarios Múltiples por Local
-- day_of_week: 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
CREATE TABLE IF NOT EXISTS local_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locals(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    shift_name TEXT NOT NULL,
    open_time TIME NOT NULL,
    close_time TIME NOT NULL,
    slot_interval_minutes INTEGER NOT NULL DEFAULT 30 CHECK (slot_interval_minutes > 0),
    turn_duration_minutes INTEGER NOT NULL DEFAULT 90 CHECK (turn_duration_minutes > 0),
    buffer_minutes INTEGER NOT NULL DEFAULT 15 CHECK (buffer_minutes >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_shift_times CHECK (open_time < close_time)
);

-- 4. Vínculo de mesas a reservas y órdenes
ALTER TABLE reservations 
    ADD COLUMN IF NOT EXISTS table_id UUID NULL REFERENCES restaurant_tables(id) ON DELETE SET NULL;

ALTER TABLE orders 
    ADD COLUMN IF NOT EXISTS table_id UUID NULL REFERENCES restaurant_tables(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS session_id UUID NULL;

-- 5. Actualizar constraint de validación de entrega en pedidos
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_delivery_address;
ALTER TABLE orders ADD CONSTRAINT chk_delivery_address CHECK (
    (order_type = 'DOMICILIO' AND delivery_address IS NOT NULL) OR
    (order_type = 'RECOGER' AND delivery_address IS NULL) OR
    (order_type = 'EN_MESA' AND delivery_address IS NULL)
);

-- 6. Habilitar RLS
ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_shifts ENABLE ROW LEVEL SECURITY;

-- Lectura pública para frontend de clientes (reservas y verificación de QR)
DROP POLICY IF EXISTS restaurant_tables_public_read ON restaurant_tables;
CREATE POLICY restaurant_tables_public_read ON restaurant_tables
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS local_shifts_public_read ON local_shifts;
CREATE POLICY local_shifts_public_read ON local_shifts
    FOR SELECT TO anon, authenticated
    USING (true);

-- Acceso completo para staff autenticado
DROP POLICY IF EXISTS restaurant_tables_staff_access ON restaurant_tables;
CREATE POLICY restaurant_tables_staff_access ON restaurant_tables
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM staff 
            WHERE staff.auth_user_id = auth.uid() 
              AND staff.location_id = restaurant_tables.location_id
        )
    );

DROP POLICY IF EXISTS local_shifts_staff_access ON local_shifts;
CREATE POLICY local_shifts_staff_access ON local_shifts
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM staff 
            WHERE staff.auth_user_id = auth.uid() 
              AND staff.location_id = local_shifts.location_id
        )
    );

-- Permisos de tabla
GRANT SELECT ON restaurant_tables TO anon, authenticated;
GRANT ALL ON restaurant_tables TO authenticated, service_role;

GRANT SELECT ON local_shifts TO anon, authenticated;
GRANT ALL ON local_shifts TO authenticated, service_role;
