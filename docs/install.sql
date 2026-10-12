-- ============================================================================
-- restaurant-order-jldev - Instalación limpia en un solo archivo
-- ============================================================================
-- Ejecutar en el SQL Editor de Supabase (rol postgres) sobre un proyecto nuevo.
-- Orden: extensiones -> tipos -> tablas -> triggers updated_at -> auth sync ->
--        RLS + policies -> índices -> vistas -> realtime -> storage -> pg_cron.
--
-- NOTA: NO incluye seed: la base queda VACÍA. Al abrir la app por primera vez,
--    /setup detecta que no hay locales y arranca el onboarding (crea el
--    primer local + admin). Para datos demo en desarrollo, ejecuta después
--    docs/seed.sql (separado, a propósito).
-- ============================================================================

-- ============================================================================
-- 1. EXTENSIONES
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- crypt() para delivery tokens
CREATE EXTENSION IF NOT EXISTS pg_cron;      -- recordatorios programados
CREATE EXTENSION IF NOT EXISTS pg_net;       -- HTTP desde pg_cron (opcional)

-- ============================================================================
-- 2. ENUMS
-- ============================================================================
CREATE TYPE order_status AS ENUM (
    'CREADO',
    'CONFIRMADO_CAJA',
    'EN_PREPARACION',
    'LISTO',
    'LISTO_PARA_ENTREGA',
    'COMPLETADO',
    'CANCELADO'
);

CREATE TYPE order_type AS ENUM ('RECOGER', 'DOMICILIO', 'EN_MESA');

CREATE TYPE table_status AS ENUM ('LIBRE', 'RESERVADA', 'OCUPADA', 'EN_LIMPIEZA');

CREATE TYPE qr_status AS ENUM ('INACTIVO', 'ABIERTO');

CREATE TYPE payment_method AS ENUM (
    'EFECTIVO_EXACTO',
    'EFECTIVO_CON_CAMBIO',
    'TARJETA_CONTRA_ENTREGA'
);

CREATE TYPE payment_status AS ENUM ('PENDIENTE', 'COBRADO');

CREATE TYPE reservation_status AS ENUM (
    'PENDIENTE',
    'CONFIRMADA',
    'CANCELADA',
    'NO_SHOW'
);

CREATE TYPE deposit_status AS ENUM (
    'SIN_DEPOSITO',
    'DEPOSITO_PENDIENTE',
    'DEPOSITADO'
);

CREATE TYPE discount_type AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

CREATE TYPE waitlist_status AS ENUM (
    'EN_ESPERA',
    'LLAMADO',
    'SENTADO',
    'CANCELADO',
    'NO_SHOW'
);


-- ============================================================================
-- 3. TABLAS
-- ============================================================================

-- 3.1 Multi-tenant root (locations por PATH: {dominio}/{slug})
CREATE TABLE locals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,  -- ruta pÃºblica de la sucursal: /{slug} (ej: 'centro')
    timezone TEXT NOT NULL DEFAULT 'America/Mexico_City',
    iva_rate NUMERIC(5,4) NOT NULL DEFAULT 0.16,
    delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
    is_open BOOLEAN NOT NULL DEFAULT true,
    address TEXT NULL,
    latitude NUMERIC(10,7) NULL,
    longitude NUMERIC(10,7) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.2 CatÃ¡logo (4 niveles)
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locals(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(location_id, name)
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locals(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    base_price NUMERIC(10,2) NOT NULL CHECK (base_price >= 0),
    is_available BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(location_id, name)
);

CREATE TABLE modifier_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locals(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT false,
    min_selections INTEGER NOT NULL DEFAULT 0 CHECK (min_selections >= 0),
    max_selections INTEGER NOT NULL DEFAULT 0 CHECK (max_selections = 0 OR max_selections >= min_selections),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(location_id, product_id, name)
);

CREATE TABLE modifier_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locals(id) ON DELETE CASCADE,
    modifier_group_id UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price_impact NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(location_id, modifier_group_id, name)
);

-- 3.3 Staff (con vínculo directo a auth.users)
CREATE TABLE staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locals(id) ON DELETE CASCADE,
    auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.4 Mesas Físicas del Restaurante
CREATE TABLE restaurant_tables (
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

-- 3.5 Turnos y Horarios Múltiples por Local
CREATE TABLE local_shifts (
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

-- 3.6 Pedidos
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locals(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    order_type order_type NOT NULL,
    payment_method payment_method NOT NULL,
    delivery_address TEXT,
    delivery_references TEXT,
    notes TEXT NULL,
    eta TIMESTAMPTZ NOT NULL,
    status order_status NOT NULL DEFAULT 'CREADO',
    payment_status payment_status NOT NULL DEFAULT 'PENDIENTE',
    subtotal NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0),
    iva_amount NUMERIC(10,2) NOT NULL CHECK (iva_amount >= 0),
    delivery_fee_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (delivery_fee_amount >= 0),
    total NUMERIC(10,2) NOT NULL CHECK (total >= 0),
    cart_snapshot JSONB NOT NULL,
    delivery_zone TEXT NULL,
    driver_id UUID NULL REFERENCES staff(id) ON DELETE SET NULL,
    table_id UUID NULL REFERENCES restaurant_tables(id) ON DELETE SET NULL,
    session_id UUID NULL,
    idempotency_key UUID NULL,
    delivery_token UUID NULL,
    delivery_token_expires_at TIMESTAMPTZ NULL,
    delivery_token_rotated_at TIMESTAMPTZ NULL,
    delivered_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NULL REFERENCES staff(id) ON DELETE SET NULL,
    updated_by UUID NULL REFERENCES staff(id) ON DELETE SET NULL,
    CONSTRAINT chk_delivery_address CHECK (
        (order_type = 'DOMICILIO' AND delivery_address IS NOT NULL) OR
        (order_type = 'RECOGER' AND delivery_address IS NULL) OR
        (order_type = 'EN_MESA' AND delivery_address IS NULL)
    )
);

-- 3.7 Reservas
CREATE TABLE reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locals(id) ON DELETE CASCADE,
    table_id UUID NULL REFERENCES restaurant_tables(id) ON DELETE SET NULL,
    holder_name TEXT NOT NULL,
    holder_phone TEXT NOT NULL,
    reservation_date DATE NOT NULL,
    reservation_time TIME NOT NULL,
    party_size INTEGER NOT NULL CHECK (party_size > 0),
    preferred_zone TEXT NOT NULL CHECK (preferred_zone IN ('INTERIOR', 'TERRAZA', 'BARRA')),
    status reservation_status NOT NULL DEFAULT 'PENDIENTE',
    deposit_status deposit_status NOT NULL DEFAULT 'SIN_DEPOSITO',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NULL REFERENCES staff(id) ON DELETE SET NULL,
    updated_by UUID NULL REFERENCES staff(id) ON DELETE SET NULL,
    CONSTRAINT chk_future_datetime CHECK (
        (reservation_date || ' ' || reservation_time)::timestamptz > now()
    )
);

CREATE TABLE local_zone_capacity (
    location_id UUID NOT NULL REFERENCES locals(id) ON DELETE CASCADE,
    zone TEXT NOT NULL CHECK (zone IN ('INTERIOR', 'TERRAZA', 'BARRA')),
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    PRIMARY KEY (location_id, zone)
);

-- 3.6 Tokens de repartidor
CREATE TABLE delivery_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ NULL,
    revoked_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.7 Descuentos
CREATE TABLE discounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locals(id) ON DELETE CASCADE,
    code TEXT UNIQUE,
    description TEXT NOT NULL,
    discount_type discount_type NOT NULL,
    value NUMERIC(10,2) NOT NULL CHECK (value >= 0),
    min_purchase NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (min_purchase >= 0),
    applies_to_product_ids UUID[],
    applies_to_category_ids UUID[],
    starts_at TIMESTAMPTZ NULL,
    ends_at TIMESTAMPTZ NULL,
    days_of_week INTEGER[] NULL,
    time_of_day_start TIME NULL,
    time_of_day_end TIME NULL,
    usage_limit_total INTEGER NULL,
    usage_limit_per_customer INTEGER NULL,
    usage_limit_per_day INTEGER NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NULL REFERENCES staff(id) ON DELETE SET NULL,
    CONSTRAINT chk_value_range CHECK (
        (discount_type = 'PERCENTAGE' AND value <= 100 AND value >= 0) OR
        (discount_type = 'FIXED_AMOUNT' AND value >= 0)
    )
);

CREATE TABLE discount_usages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discount_id UUID NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    customer_phone TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    amount_applied NUMERIC(10,2) NOT NULL CHECK (amount_applied >= 0)
);

-- 3.8 AlÃ©rgenos y etiquetas dietarias
CREATE TABLE allergens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE diet_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE product_allergens (
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    allergen_id UUID NOT NULL REFERENCES allergens(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, allergen_id)
);

CREATE TABLE product_diet_labels (
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    diet_label_id UUID NOT NULL REFERENCES diet_labels(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, diet_label_id)
);

-- Sembrar alérgenos estándar (NOM-050) y etiquetas dietarias de base
INSERT INTO allergens (name, description) VALUES
    ('GLUTEN', 'Trigo, cebada, centeno'),
    ('LACTEOS', 'Leche y derivados'),
    ('HUEVO', NULL),
    ('PESCADO', NULL),
    ('SOJA', NULL),
    ('FRUTOS_SECOS', 'Almendras, nueces, etc.'),
    ('CACAHUATE', NULL),
    ('CRUSTACEOS', NULL),
    ('MOLUSCOS', NULL),
    ('APIO', NULL),
    ('MOSTAZA', NULL),
    ('SESAMO', NULL),
    ('SULFITOS', NULL),
    ('ALT_TRIGO', 'Altramuces') ON CONFLICT (name) DO NOTHING;

INSERT INTO diet_labels (name, description) VALUES
    ('VEGETARIANO', 'Sin carne'),
    ('VEGANO', 'Sin ingredientes de origen animal'),
    ('SIN_GLUTEN', NULL),
    ('SIN_LACTOSA', NULL),
    ('PICANTE', NULL) ON CONFLICT (name) DO NOTHING;

-- 3.11 Fila de Espera Virtual (Waitlist / Walk-ins)
CREATE TABLE waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locals(id) ON DELETE CASCADE,
    table_id UUID NULL REFERENCES restaurant_tables(id) ON DELETE SET NULL,
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
    created_by UUID NULL REFERENCES staff(id) ON DELETE SET NULL,
    updated_by UUID NULL REFERENCES staff(id) ON DELETE SET NULL
);


-- ============================================================================
-- 4. TRIGGER updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_updated_at_column() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'locals','categories','products','modifier_groups','modifier_options',
        'orders','reservations','staff','discounts','restaurant_tables','waitlist'
    ]
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I;
            CREATE TRIGGER trg_%I_updated_at
            BEFORE UPDATE ON %I
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        ', tbl, tbl, tbl, tbl);
    END LOOP;
END $$;

-- ============================================================================
-- 5. AUTH SYNC: vincular auth.users – staff por email
-- ============================================================================

-- 5.1 Vincular staff existente por email (uso manual tras migrar usuarios)
CREATE OR REPLACE FUNCTION public.link_staff_to_auth()
RETURNS void 
LANGUAGE plpgsql
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  UPDATE public.staff s
  SET auth_user_id = u.id
  FROM auth.users u
  WHERE s.auth_user_id IS NULL
    AND s.email = u.email;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.link_staff_to_auth() FROM PUBLIC, anon, authenticated;

-- 5.2 Trigger en staff: al insertar/actualizar, vincular si coincide email
-- SECURITY DEFINER + search_path bloqueado (patron oficial Supabase para
-- triggers que cruzan schemas): la funcion corre como su dueno (postgres),
-- con acceso garantizado a auth.users sin depender de los GRANTs del rol
-- que inserta. Nombres calificados porque search_path = ''.
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

DROP TRIGGER IF EXISTS trigger_staff_sync_auth_user ON staff;
CREATE TRIGGER trigger_staff_sync_auth_user
BEFORE INSERT OR UPDATE ON staff
FOR EACH ROW EXECUTE FUNCTION public.staff_sync_auth_user();

REVOKE EXECUTE ON FUNCTION public.staff_sync_auth_user() FROM PUBLIC, anon, authenticated;

-- 5.3 Trigger inverso: al crear usuario auth, vincular staff pendiente
-- CRITICO: SECURITY DEFINER + search_path bloqueado. El INSERT en auth.users
-- lo ejecuta el rol supabase_auth_admin (GoTrue), que NO tiene privilegios
-- sobre public.staff; en SECURITY INVOKER el UPDATE fallaba con 42501 y
-- GoTrue respondia "Database error creating new user" (HTTP 500), bloqueando
-- /setup y la invitacion de staff. Fail-soft: un fallo de vinculacion queda
-- como WARNING y no aborta la creacion del usuario (la app vincula
-- explicitamente auth_user_id tras crearlo; fallback por email).
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

DROP TRIGGER IF EXISTS trigger_auth_user_sync_staff ON auth.users;
CREATE TRIGGER trigger_auth_user_sync_staff
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.auth_user_sync_staff();

REVOKE EXECUTE ON FUNCTION public.auth_user_sync_staff() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE locals ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifier_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_zone_capacity ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_usages ENABLE ROW LEVEL SECURITY;
ALTER TABLE allergens ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_allergens ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_diet_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- PatrÃ³n GUC: el backend setea 'app.local_id' (y 'app.token_plain' si aplica)
-- antes de cada consulta. current_setting(..., true) devuelve NULL si no existe.

CREATE POLICY locals_staff_access ON locals
FOR ALL
USING (id = current_setting('app.local_id', true)::uuid)
WITH CHECK (id = current_setting('app.local_id', true)::uuid);

CREATE POLICY categories_staff_access ON categories
FOR ALL
USING (location_id = current_setting('app.local_id', true)::uuid)
WITH CHECK (location_id = current_setting('app.local_id', true)::uuid);

CREATE POLICY categories_public_read ON categories
FOR SELECT
USING (
    is_active = true
    AND (
        location_id = NULLIF(current_setting('app.local_id', true), '')::uuid
        OR location_id = NULLIF(current_setting('request.headers', true)::json->>'x-location-id', '')::uuid
    )
);

CREATE POLICY products_staff_access ON products
FOR ALL
USING (location_id = current_setting('app.local_id', true)::uuid)
WITH CHECK (location_id = current_setting('app.local_id', true)::uuid);

CREATE POLICY products_public_read ON products
FOR SELECT
USING (
    is_available = true
    AND (
        location_id = NULLIF(current_setting('app.local_id', true), '')::uuid
        OR location_id = NULLIF(current_setting('request.headers', true)::json->>'x-location-id', '')::uuid
    )
);

CREATE POLICY modifier_groups_staff_access ON modifier_groups
FOR ALL
USING (location_id = current_setting('app.local_id', true)::uuid)
WITH CHECK (location_id = current_setting('app.local_id', true)::uuid);

CREATE POLICY modifier_groups_public_read ON modifier_groups
FOR SELECT
USING (
    location_id = NULLIF(current_setting('app.local_id', true), '')::uuid
    OR location_id = NULLIF(current_setting('request.headers', true)::json->>'x-location-id', '')::uuid
);

CREATE POLICY modifier_options_staff_access ON modifier_options
FOR ALL
USING (location_id = current_setting('app.local_id', true)::uuid)
WITH CHECK (location_id = current_setting('app.local_id', true)::uuid);

CREATE POLICY modifier_options_public_read ON modifier_options
FOR SELECT
USING (
    is_active = true
    AND (
        location_id = NULLIF(current_setting('app.local_id', true), '')::uuid
        OR location_id = NULLIF(current_setting('request.headers', true)::json->>'x-location-id', '')::uuid
    )
);

CREATE POLICY orders_staff_access ON orders
FOR ALL
USING (location_id = current_setting('app.local_id', true)::uuid)
WITH CHECK (location_id = current_setting('app.local_id', true)::uuid);

-- Realtime: permite SELECT al staff autenticado validando su pertenencia en staff
CREATE POLICY orders_staff_live ON orders
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

CREATE POLICY reservations_staff_access ON reservations
FOR ALL
USING (location_id = current_setting('app.local_id', true)::uuid)
WITH CHECK (location_id = current_setting('app.local_id', true)::uuid);

CREATE POLICY local_zone_capacity_staff_access ON local_zone_capacity
FOR ALL
USING (location_id = current_setting('app.local_id', true)::uuid)
WITH CHECK (location_id = current_setting('app.local_id', true)::uuid);

CREATE POLICY local_zone_capacity_public_read ON local_zone_capacity
FOR SELECT
USING (true);

-- Mesas físicas
CREATE POLICY restaurant_tables_public_read ON restaurant_tables
FOR SELECT
USING (true);

CREATE POLICY restaurant_tables_staff_access ON restaurant_tables
FOR ALL
USING (
    location_id = current_setting('app.local_id', true)::uuid
    OR EXISTS (
        SELECT 1 FROM staff 
        WHERE staff.auth_user_id = auth.uid() 
          AND staff.location_id = restaurant_tables.location_id
    )
)
WITH CHECK (
    location_id = current_setting('app.local_id', true)::uuid
    OR EXISTS (
        SELECT 1 FROM staff 
        WHERE staff.auth_user_id = auth.uid() 
          AND staff.location_id = restaurant_tables.location_id
    )
);

-- Turnos y Horarios
CREATE POLICY local_shifts_public_read ON local_shifts
FOR SELECT
USING (true);

CREATE POLICY local_shifts_staff_access ON local_shifts
FOR ALL
USING (
    location_id = current_setting('app.local_id', true)::uuid
    OR EXISTS (
        SELECT 1 FROM staff 
        WHERE staff.auth_user_id = auth.uid() 
          AND staff.location_id = local_shifts.location_id
    )
)
WITH CHECK (
    location_id = current_setting('app.local_id', true)::uuid
    OR EXISTS (
        SELECT 1 FROM staff 
        WHERE staff.auth_user_id = auth.uid() 
          AND staff.location_id = local_shifts.location_id
    )
);

-- Fila de espera virtual (Waitlist)
-- Lectura pública para suscripciones Realtime por tracking_token.
-- Las mutaciones (join/cancel) corren en Node vía Server Actions con service_role.
CREATE POLICY waitlist_public_read ON waitlist
FOR SELECT
USING (true);

CREATE POLICY waitlist_staff_access ON waitlist
FOR ALL
USING (
    location_id = current_setting('app.local_id', true)::uuid
    OR EXISTS (
        SELECT 1 FROM staff 
        WHERE staff.auth_user_id = auth.uid() 
          AND staff.location_id = waitlist.location_id
    )
)
WITH CHECK (
    location_id = current_setting('app.local_id', true)::uuid
    OR EXISTS (
        SELECT 1 FROM staff 
        WHERE staff.auth_user_id = auth.uid() 
          AND staff.location_id = waitlist.location_id
    )
);

CREATE POLICY staff_staff_access ON staff
FOR ALL
USING (location_id = current_setting('app.local_id', true)::uuid)
WITH CHECK (location_id = current_setting('app.local_id', true)::uuid);

CREATE POLICY delivery_tokens_anon_read ON delivery_tokens
FOR SELECT
USING (
    crypt(NULLIF(current_setting('app.token_plain', true), ''), token_hash) = token_hash
    AND used_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
);

CREATE POLICY delivery_tokens_anon_use ON delivery_tokens
FOR UPDATE
USING (
    crypt(NULLIF(current_setting('app.token_plain', true), ''), token_hash) = token_hash
    AND used_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
)
WITH CHECK (
    used_at IS NOT NULL
);

CREATE POLICY delivery_tokens_staff_access ON delivery_tokens
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM orders o
        WHERE o.id = delivery_tokens.order_id
          AND o.location_id = current_setting('app.local_id', true)::uuid
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM orders o
        WHERE o.id = delivery_tokens.order_id
          AND o.location_id = current_setting('app.local_id', true)::uuid
    )
);

CREATE POLICY discounts_staff_access ON discounts
FOR ALL
USING (location_id = current_setting('app.local_id', true)::uuid)
WITH CHECK (location_id = current_setting('app.local_id', true)::uuid);

CREATE POLICY discounts_public_read ON discounts
FOR SELECT
USING (
    is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
    AND (
        location_id = NULLIF(current_setting('app.local_id', true), '')::uuid
        OR location_id = NULLIF(current_setting('request.headers', true)::json->>'x-location-id', '')::uuid
    )
);

CREATE POLICY discount_usages_staff_access ON discount_usages
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM discounts d
        WHERE d.id = discount_usages.discount_id
          AND d.location_id = current_setting('app.local_id', true)::uuid
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM discounts d
        WHERE d.id = discount_usages.discount_id
          AND d.location_id = current_setting('app.local_id', true)::uuid
    )
);

CREATE POLICY allergens_public_read ON allergens
FOR SELECT USING (true);

CREATE POLICY diet_labels_public_read ON diet_labels
FOR SELECT USING (true);

CREATE POLICY product_allergens_staff_access ON product_allergens
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM products p
        WHERE p.id = product_allergens.product_id
          AND p.location_id = current_setting('app.local_id', true)::uuid
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM products p
        WHERE p.id = product_allergens.product_id
          AND p.location_id = current_setting('app.local_id', true)::uuid
    )
);

CREATE POLICY product_allergens_public_read ON product_allergens
FOR SELECT USING (true);

CREATE POLICY product_diet_labels_staff_access ON product_diet_labels
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM products p
        WHERE p.id = product_diet_labels.product_id
          AND p.location_id = current_setting('app.local_id', true)::uuid
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM products p
        WHERE p.id = product_diet_labels.product_id
          AND p.location_id = current_setting('app.local_id', true)::uuid
    )
);

CREATE POLICY product_diet_labels_public_read ON product_diet_labels
FOR SELECT USING (true);

-- ----------------------------------------------------------------------------
-- 6.1 Privilegios base (GRANT). Las policies de arriba definen QUÃ‰ FILAS ve
-- cada rol; los GRANT son el privilegio BASE de conexiÃ³n/lectura. Sin ellos
-- las policies ni siquiera se evalÃºan: PostgREST responde 401 code 42501
-- "permission denied for table X". Nota: en proyectos con API keys nuevas
-- (sb_publishable_*) las tablas creadas por SQL Editor NO heredan defaults.
-- Script equivalente para proyectos ya instalados: docs/fix-grants-public-read.sql
-- ----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON TABLE
    categories, products, modifier_groups, modifier_options,
    allergens, diet_labels, product_allergens, product_diet_labels,
    discounts, local_zone_capacity
TO anon, authenticated;

-- locals: solo ping de /api/health (RLS oculta todas las filas al anon).
GRANT SELECT ON TABLE locals TO anon, authenticated;

-- orders: solo authenticated (JWT de staff) para Realtime (orders_staff_live).
GRANT SELECT ON TABLE orders TO authenticated;
-- waitlist: solo SELECT para Realtime de clientes (anon); control total para staff (authenticated) y service_role.
GRANT SELECT ON TABLE waitlist TO anon;
GRANT ALL ON TABLE waitlist TO authenticated;

-- ============================================================================
-- 7. ÃNDICES
-- ============================================================================
CREATE INDEX idx_orders_location_status ON orders(location_id, status);
CREATE UNIQUE INDEX idx_orders_idempotency_key ON orders(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_orders_eta ON orders(eta);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_customer_phone ON orders(customer_phone);
CREATE INDEX idx_orders_driver ON orders(driver_id);
CREATE INDEX idx_orders_table_id ON orders(table_id);
CREATE INDEX idx_reservations_table_id ON reservations(table_id);
CREATE INDEX idx_restaurant_tables_location ON restaurant_tables(location_id);
CREATE INDEX idx_restaurant_tables_qr_token ON restaurant_tables(qr_token);
CREATE INDEX idx_local_shifts_location ON local_shifts(location_id);
CREATE INDEX idx_waitlist_location_status ON waitlist(location_id, status, created_at);
CREATE INDEX idx_waitlist_tracking_token ON waitlist(tracking_token);
CREATE INDEX idx_reservations_location_date ON reservations(location_id, reservation_date);
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_staff_location ON staff(location_id);
CREATE INDEX idx_staff_auth_user_id ON staff(auth_user_id);
CREATE INDEX idx_delivery_tokens_order_id ON delivery_tokens(order_id);
CREATE INDEX idx_discounts_location_active ON discounts(location_id, is_active);
CREATE INDEX idx_product_allergens_product ON product_allergens(product_id);
CREATE INDEX idx_product_diet_labels_product ON product_diet_labels(product_id);
CREATE INDEX idx_discount_usages_discount ON discount_usages(discount_id);

-- ============================================================================
-- 8. VISTAS
-- ============================================================================

-- Vista segura para KDS/Caja: expone solo lo necesario, sin datos sensibles.
-- security_invoker = true â†’ aplica RLS de la tabla subyacente.
DROP VIEW IF EXISTS staff_orders_view;

CREATE VIEW staff_orders_view
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
FROM orders o;

GRANT SELECT ON staff_orders_view TO anon, authenticated;
GRANT SELECT ON staff_orders_view TO service_role;

-- ============================================================================
-- 9. COMENTARIOS
-- ============================================================================
COMMENT ON TABLE locals IS 'Multi-tenant root: cada local/restaurante';
COMMENT ON COLUMN locals.iva_rate IS 'Tasa de IVA del local (0.16 = 16%). Ajustable por local.';
COMMENT ON COLUMN locals.delivery_fee IS 'Tarifa fija base de delivery del local (fallback cuando no aplica cálculo por matriz OSM).';
COMMENT ON COLUMN locals.address IS 'Dirección física del local o sucursal';
COMMENT ON COLUMN locals.latitude IS 'Latitud GPS del local para cálculo de matriz de distancias';
COMMENT ON COLUMN locals.longitude IS 'Longitud GPS del local para cálculo de matriz de distancias';
COMMENT ON COLUMN staff.auth_user_id IS 'Referencia a auth.users.id para vinculaciÃ³n directa y consultas sin depender de email';
COMMENT ON TABLE orders IS 'Pedidos; snapshot con precios pÃºblicos (IVA incluido)';
COMMENT ON COLUMN orders.cart_snapshot IS 'JSONB schema fijo: items[] {product_id, product_name, base_price (IVA incl.), quantity, modifiers[{group, selections[]}]}';
COMMENT ON COLUMN orders.iva_amount IS 'IVA interno para contabilidad: subtotal * rate/(1+rate). No se suma al pÃºblico.';
COMMENT ON TABLE delivery_tokens IS 'Token Ãºnico de repartidor: EN_CAMINO -> COMPLETADO, un solo uso';
COMMENT ON TABLE discounts IS 'Engine de promos: cÃ³digos o automÃ¡ticas con reglas; sin apilar';
COMMENT ON TABLE waitlist IS 'Fila de espera virtual (walk-ins) con token de seguimiento';
COMMENT ON COLUMN waitlist.tracking_token IS 'UUID público para seguimiento de posición y cancelación en tiempo real por el comensal';

-- ============================================================================
-- Permisos para service_role (bypass RLS en operaciones server-side)
-- ============================================================================
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

GRANT SELECT ON restaurant_tables TO anon, authenticated;
GRANT ALL ON restaurant_tables TO authenticated;
GRANT SELECT ON local_shifts TO anon, authenticated;
GRANT ALL ON local_shifts TO authenticated;

-- TambiÃ©n grant en auth schema para gestiÃ³n de usuarios si se necesita
GRANT USAGE ON SCHEMA auth TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA auth TO service_role;

-- ============================================================================
-- 10. REALTIME (Publicación supabase_realtime)
-- ============================================================================
-- Agrega las tablas necesarias a la publicación de Realtime para eventos en vivo
-- (Caja/KDS, disponibilidad de productos del menú y fila de espera virtual).
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

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'waitlist'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.waitlist;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- 11. SUPABASE STORAGE (Bucket de imágenes del menú)
-- ============================================================================
-- Configura el bucket 'menu-images' público para fotos de categorías y productos.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
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
  END IF;
END $$;

-- ============================================================================
-- 12. PG_CRON: recordatorios de reservaciones (opcional)
-- ============================================================================
-- Requiere definir la GUC app.cron_secret en Supabase (Settings â†’ Database â†’
-- Custom Configuration o vÃ­a supabase secrets).
-- Los endpoints /api/cron/reminders/24h y /2h deben existir en la app Next.js
-- y validar el header Authorization contra CRON_SECRET.

SELECT cron.schedule(
  'reservation-reminders-24h',
  '0 * * * *',
  $$
  SELECT net.http_get(
    url := 'https://your-domain.vercel.app/api/cron/reminders/24h',
    headers := '{"Authorization": "Bearer ' || current_setting('app.cron_secret', true) || '"}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'reservation-reminders-2h',
  '0 * * * *',
  $$
  SELECT net.http_get(
    url := 'https://your-domain.vercel.app/api/cron/reminders/2h',
    headers := '{"Authorization": "Bearer ' || current_setting('app.cron_secret', true) || '"}'::jsonb
  );
  $$
);

-- Para desactivar:
-- SELECT cron.unschedule('reservation-reminders-24h');
-- SELECT cron.unschedule('reservation-reminders-2h');

-- ============================================================================
-- 13. AUDITORÍA (audit_log)
-- ============================================================================
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

CREATE POLICY audit_log_staff_read ON public.audit_log
FOR SELECT USING (
    location_id = NULLIF(current_setting('app.local_id', true), '')::uuid
);

GRANT SELECT ON TABLE public.audit_log TO authenticated;
GRANT ALL ON TABLE public.audit_log TO service_role;


