-- ============================================================================
-- restaurant-order-jldev - Instalación limpia en un solo archivo maestro
-- ============================================================================
-- Ejecutar en el SQL Editor de Supabase (rol postgres) sobre un proyecto nuevo
-- o existente.
--
-- Orden de ejecución:
--   1. Extensiones (pgcrypto, pg_cron, pg_net en extensions schema)
--   2. Tipos y Enums personalizados
--   3. Tablas maestras con constraints y claves foráneas consolidadas
--   4. Triggers de actualización (updated_at)
--   5. Sincronización Auth <-> Staff (triggers y funciones seguras)
--   6. Row Level Security (RLS) y políticas de acceso multi-tenant
--   7. Privilegios y permisos (GRANTs para anon, authenticated, service_role)
--   8. Índices de rendimiento y búsqueda rápida
--   9. Vistas seguras (local_zone_capacity, staff_orders_view) y RPCs (get_available_tables)
--  10. Publicación Supabase Realtime (orders, products, waitlist)
--  11. Supabase Storage (bucket menu-images)
--  12. Auditoría y Tareas Programadas (audit_log y bloque seguro pg_cron)
--
-- NOTA: Este script NO contiene datos semilla (seed demo). Al abrir la app
-- por primera vez, /setup detecta una base vacía e inicia el asistente de
-- bienvenida para crear la primera sucursal y el administrador.
-- Para cargar datos de prueba en desarrollo, ejecuta posteriormente `docs/seed.sql`.
--
-- Totalmente IDEMPOTENTE: puede ejecutarse múltiples veces sin errores.
-- ============================================================================

-- ============================================================================
-- 1. EXTENSIONES Y ESQUEMAS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Crear esquema dedicado para extensiones auxiliares y evitar avisos del linter
CREATE SCHEMA IF NOT EXISTS extensions;

-- Habilitar pg_cron y pg_net si están disponibles en la instancia
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron no disponible o permisos insuficientes (ignorado si no se usa): %', SQLERRM;
END $$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
EXCEPTION WHEN OTHERS THEN
  -- Si ya existe en public, intentar moverla a extensions
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_net' AND extnamespace = 'public'::regnamespace
  ) THEN
    BEGIN
      ALTER EXTENSION pg_net SET SCHEMA extensions;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END $$;


-- ============================================================================
-- 2. TIPOS PERSONALIZADOS Y ENUMS
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    CREATE TYPE order_status AS ENUM (
      'CREADO',
      'CONFIRMADO_CAJA',
      'EN_PREPARACION',
      'LISTO',
      'LISTO_PARA_ENTREGA',
      'COMPLETADO',
      'CANCELADO'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_type') THEN
    CREATE TYPE order_type AS ENUM ('RECOGER', 'DOMICILIO', 'EN_MESA');
  ELSE
    -- Asegurar valor EN_MESA si el tipo ya existía
    BEGIN
      ALTER TYPE order_type ADD VALUE IF NOT EXISTS 'EN_MESA';
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'table_status') THEN
    CREATE TYPE table_status AS ENUM ('LIBRE', 'RESERVADA', 'OCUPADA', 'EN_LIMPIEZA');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'qr_status') THEN
    CREATE TYPE qr_status AS ENUM ('INACTIVO', 'ABIERTO');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
    CREATE TYPE payment_method AS ENUM (
      'EFECTIVO_EXACTO',
      'EFECTIVO_CON_CAMBIO',
      'TARJETA_CONTRA_ENTREGA'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE payment_status AS ENUM ('PENDIENTE', 'COBRADO');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reservation_status') THEN
    CREATE TYPE reservation_status AS ENUM (
      'PENDIENTE',
      'CONFIRMADA',
      'CANCELADA',
      'NO_SHOW'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deposit_status') THEN
    CREATE TYPE deposit_status AS ENUM (
      'SIN_DEPOSITO',
      'DEPOSITO_PENDIENTE',
      'DEPOSITADO'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'discount_type') THEN
    CREATE TYPE discount_type AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waitlist_status') THEN
    CREATE TYPE waitlist_status AS ENUM (
      'EN_ESPERA',
      'LLAMADO',
      'SENTADO',
      'CANCELADO',
      'NO_SHOW'
    );
  END IF;
END $$;


-- ============================================================================
-- 3. TABLAS BASE
-- ============================================================================

-- 3.1 Multi-tenant root (sucursales por ruta pública: /{slug})
CREATE TABLE IF NOT EXISTS public.locals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'America/Mexico_City',
    iva_rate NUMERIC(5,4) NOT NULL DEFAULT 0.16,
    delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
    is_open BOOLEAN NOT NULL DEFAULT true,
    is_catalog_only BOOLEAN NOT NULL DEFAULT false,
    reservations_enabled BOOLEAN NOT NULL DEFAULT true,
    address TEXT NULL,
    latitude NUMERIC(10,7) NULL,
    longitude NUMERIC(10,7) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.2 Staff (personal de la sucursal vinculado a auth.users)
CREATE TABLE IF NOT EXISTS public.staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES public.locals(id) ON DELETE CASCADE,
    auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.3 Catálogo: Categorías
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES public.locals(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(location_id, name)
);

-- 3.4 Catálogo: Productos
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES public.locals(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    base_price NUMERIC(10,2) NOT NULL CHECK (base_price >= 0),
    is_available BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(location_id, name)
);

-- 3.5 Catálogo: Grupos de Modificadores
CREATE TABLE IF NOT EXISTS public.modifier_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES public.locals(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT false,
    min_selections INTEGER NOT NULL DEFAULT 0 CHECK (min_selections >= 0),
    max_selections INTEGER NOT NULL DEFAULT 0 CHECK (max_selections = 0 OR max_selections >= min_selections),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(location_id, product_id, name)
);

-- 3.6 Catálogo: Opciones de Modificadores
CREATE TABLE IF NOT EXISTS public.modifier_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES public.locals(id) ON DELETE CASCADE,
    modifier_group_id UUID NOT NULL REFERENCES public.modifier_groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price_impact NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(location_id, modifier_group_id, name)
);

-- 3.7 Alérgenos (NOM-050) y Etiquetas Dietarias
CREATE TABLE IF NOT EXISTS public.allergens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE IF NOT EXISTS public.diet_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE IF NOT EXISTS public.product_allergens (
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    allergen_id UUID NOT NULL REFERENCES public.allergens(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, allergen_id)
);

CREATE TABLE IF NOT EXISTS public.product_diet_labels (
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    diet_label_id UUID NOT NULL REFERENCES public.diet_labels(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, diet_label_id)
);

-- Sembrar alérgenos estándar (NOM-050) y dietas de referencia si no existen
INSERT INTO public.allergens (name, description) VALUES
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
    ('ALT_TRIGO', 'Altramuces')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.diet_labels (name, description) VALUES
    ('VEGETARIANO', 'Sin carne'),
    ('VEGANO', 'Sin ingredientes de origen animal'),
    ('SIN_GLUTEN', NULL),
    ('SIN_LACTOSA', NULL),
    ('PICANTE', NULL)
ON CONFLICT (name) DO NOTHING;

-- 3.8 Mesas Físicas del Restaurante
CREATE TABLE IF NOT EXISTS public.restaurant_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES public.locals(id) ON DELETE CASCADE,
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

-- 3.9 Turnos y Horarios Múltiples por Local
CREATE TABLE IF NOT EXISTS public.local_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES public.locals(id) ON DELETE CASCADE,
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

-- 3.10 Pedidos (Orders)
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES public.locals(id) ON DELETE CASCADE,
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
    driver_id UUID NULL REFERENCES public.staff(id) ON DELETE SET NULL,
    table_id UUID NULL REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
    session_id UUID NULL,
    idempotency_key UUID NULL,
    delivery_token UUID NULL,
    delivery_token_expires_at TIMESTAMPTZ NULL,
    delivery_token_rotated_at TIMESTAMPTZ NULL,
    delivered_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NULL REFERENCES public.staff(id) ON DELETE SET NULL,
    updated_by UUID NULL REFERENCES public.staff(id) ON DELETE SET NULL,
    CONSTRAINT chk_delivery_address CHECK (
        (order_type = 'DOMICILIO' AND delivery_address IS NOT NULL) OR
        (order_type = 'RECOGER' AND delivery_address IS NULL) OR
        (order_type = 'EN_MESA' AND delivery_address IS NULL)
    )
);

-- Limpieza preventiva de constraints obsoletos en bases existentes
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS chk_eta_future;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS chk_total_consistency;

-- 3.11 Tokens de Repartidor
CREATE TABLE IF NOT EXISTS public.delivery_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ NULL,
    revoked_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.12 Reservaciones de Mesa
CREATE TABLE IF NOT EXISTS public.reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES public.locals(id) ON DELETE CASCADE,
    table_id UUID NULL REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
    table_ids UUID[] NOT NULL DEFAULT '{}',
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
    created_by UUID NULL REFERENCES public.staff(id) ON DELETE SET NULL,
    updated_by UUID NULL REFERENCES public.staff(id) ON DELETE SET NULL,
    CONSTRAINT chk_future_datetime CHECK (
        (reservation_date || ' ' || reservation_time)::timestamptz > now()
    )
);

-- 3.13 Descuentos y Promociones
CREATE TABLE IF NOT EXISTS public.discounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES public.locals(id) ON DELETE CASCADE,
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
    created_by UUID NULL REFERENCES public.staff(id) ON DELETE SET NULL,
    CONSTRAINT chk_value_range CHECK (
        (discount_type = 'PERCENTAGE' AND value <= 100 AND value >= 0) OR
        (discount_type = 'FIXED_AMOUNT' AND value >= 0)
    )
);

CREATE TABLE IF NOT EXISTS public.discount_usages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discount_id UUID NOT NULL REFERENCES public.discounts(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    customer_phone TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    amount_applied NUMERIC(10,2) NOT NULL CHECK (amount_applied >= 0)
);

-- 3.14 Fila de Espera Virtual (Waitlist)
CREATE TABLE IF NOT EXISTS public.waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES public.locals(id) ON DELETE CASCADE,
    table_id UUID NULL REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
    table_ids UUID[] NOT NULL DEFAULT '{}',
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

-- 3.15 Auditoría de Operaciones (audit_log)
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


-- ============================================================================
-- 4. TRIGGERS DE UPDATED_AT
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

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
            DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;
            CREATE TRIGGER trg_%I_updated_at
            BEFORE UPDATE ON public.%I
            FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
        ', tbl, tbl, tbl, tbl);
    END LOOP;
END $$;


-- ============================================================================
-- 5. SINCRONIZACIÓN AUTH <-> STAFF
-- ============================================================================

-- 5.1 Función utilitaria para vincular staff existente por email
CREATE OR REPLACE FUNCTION public.link_staff_to_auth()
RETURNS void 
LANGUAGE plpgsql
SECURITY DEFINER
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
GRANT EXECUTE ON FUNCTION public.link_staff_to_auth() TO service_role;

-- 5.2 Trigger directo en staff: al insertar/actualizar, vincular si coincide email
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

DROP TRIGGER IF EXISTS trigger_staff_sync_auth_user ON public.staff;
CREATE TRIGGER trigger_staff_sync_auth_user
BEFORE INSERT OR UPDATE ON public.staff
FOR EACH ROW EXECUTE FUNCTION public.staff_sync_auth_user();

REVOKE EXECUTE ON FUNCTION public.staff_sync_auth_user() FROM PUBLIC, anon, authenticated;

-- 5.3 Trigger inverso en auth.users: al crear usuario en Auth, vincular staff pendiente
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
-- 6. ROW LEVEL SECURITY (RLS) Y POLÍTICAS
-- ============================================================================
ALTER TABLE public.locals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifier_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_usages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allergens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diet_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_allergens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_diet_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- 6.1 locals
DROP POLICY IF EXISTS locals_staff_access ON public.locals;
CREATE POLICY locals_staff_access ON public.locals
FOR ALL
USING (id = current_setting('app.local_id', true)::uuid)
WITH CHECK (id = current_setting('app.local_id', true)::uuid);

-- 6.2 categories
DROP POLICY IF EXISTS categories_staff_access ON public.categories;
CREATE POLICY categories_staff_access ON public.categories
FOR ALL
USING (location_id = current_setting('app.local_id', true)::uuid)
WITH CHECK (location_id = current_setting('app.local_id', true)::uuid);

DROP POLICY IF EXISTS categories_public_read ON public.categories;
CREATE POLICY categories_public_read ON public.categories
FOR SELECT
USING (is_active = true);

-- 6.3 products
DROP POLICY IF EXISTS products_staff_access ON public.products;
CREATE POLICY products_staff_access ON public.products
FOR ALL
USING (location_id = current_setting('app.local_id', true)::uuid)
WITH CHECK (location_id = current_setting('app.local_id', true)::uuid);

DROP POLICY IF EXISTS products_public_read ON public.products;
CREATE POLICY products_public_read ON public.products
FOR SELECT
USING (true);

-- 6.4 modifier_groups
DROP POLICY IF EXISTS modifier_groups_staff_access ON public.modifier_groups;
CREATE POLICY modifier_groups_staff_access ON public.modifier_groups
FOR ALL
USING (location_id = current_setting('app.local_id', true)::uuid)
WITH CHECK (location_id = current_setting('app.local_id', true)::uuid);

DROP POLICY IF EXISTS modifier_groups_public_read ON public.modifier_groups;
CREATE POLICY modifier_groups_public_read ON public.modifier_groups
FOR SELECT
USING (true);

-- 6.5 modifier_options
DROP POLICY IF EXISTS modifier_options_staff_access ON public.modifier_options;
CREATE POLICY modifier_options_staff_access ON public.modifier_options
FOR ALL
USING (location_id = current_setting('app.local_id', true)::uuid)
WITH CHECK (location_id = current_setting('app.local_id', true)::uuid);

DROP POLICY IF EXISTS modifier_options_public_read ON public.modifier_options;
CREATE POLICY modifier_options_public_read ON public.modifier_options
FOR SELECT
USING (true);

-- 6.6 orders
DROP POLICY IF EXISTS orders_staff_access ON public.orders;
CREATE POLICY orders_staff_access ON public.orders
FOR ALL
USING (location_id = current_setting('app.local_id', true)::uuid)
WITH CHECK (location_id = current_setting('app.local_id', true)::uuid);

DROP POLICY IF EXISTS orders_staff_live ON public.orders;
CREATE POLICY orders_staff_live ON public.orders
FOR SELECT
TO authenticated
USING (
    location_id = NULLIF(current_setting('app.local_id', true), '')::uuid
    OR EXISTS (
        SELECT 1 FROM public.staff 
        WHERE staff.auth_user_id = (select auth.uid())
          AND staff.location_id = orders.location_id
    )
);

-- 6.7 reservations
DROP POLICY IF EXISTS reservations_staff_access ON public.reservations;
CREATE POLICY reservations_staff_access ON public.reservations
FOR ALL
USING (location_id = current_setting('app.local_id', true)::uuid)
WITH CHECK (location_id = current_setting('app.local_id', true)::uuid);

-- 6.8 restaurant_tables
DROP POLICY IF EXISTS restaurant_tables_public_read ON public.restaurant_tables;
CREATE POLICY restaurant_tables_public_read ON public.restaurant_tables
FOR SELECT
USING (true);

DROP POLICY IF EXISTS restaurant_tables_staff_access ON public.restaurant_tables;
CREATE POLICY restaurant_tables_staff_access ON public.restaurant_tables
FOR ALL
USING (
    location_id = current_setting('app.local_id', true)::uuid
    OR EXISTS (
        SELECT 1 FROM public.staff 
        WHERE staff.auth_user_id = (select auth.uid())
          AND staff.location_id = restaurant_tables.location_id
    )
)
WITH CHECK (
    location_id = current_setting('app.local_id', true)::uuid
    OR EXISTS (
        SELECT 1 FROM public.staff 
        WHERE staff.auth_user_id = (select auth.uid())
          AND staff.location_id = restaurant_tables.location_id
    )
);

-- 6.9 local_shifts
DROP POLICY IF EXISTS local_shifts_public_read ON public.local_shifts;
CREATE POLICY local_shifts_public_read ON public.local_shifts
FOR SELECT
USING (true);

DROP POLICY IF EXISTS local_shifts_staff_access ON public.local_shifts;
CREATE POLICY local_shifts_staff_access ON public.local_shifts
FOR ALL
USING (
    location_id = current_setting('app.local_id', true)::uuid
    OR EXISTS (
        SELECT 1 FROM public.staff 
        WHERE staff.auth_user_id = (select auth.uid())
          AND staff.location_id = local_shifts.location_id
    )
)
WITH CHECK (
    location_id = current_setting('app.local_id', true)::uuid
    OR EXISTS (
        SELECT 1 FROM public.staff 
        WHERE staff.auth_user_id = (select auth.uid())
          AND staff.location_id = local_shifts.location_id
    )
);

-- 6.10 waitlist
DROP POLICY IF EXISTS waitlist_public_read ON public.waitlist;
CREATE POLICY waitlist_public_read ON public.waitlist
FOR SELECT
USING (true);

DROP POLICY IF EXISTS waitlist_public_insert ON public.waitlist;
DROP POLICY IF EXISTS waitlist_update ON public.waitlist;

DROP POLICY IF EXISTS waitlist_staff_access ON public.waitlist;
CREATE POLICY waitlist_staff_access ON public.waitlist
FOR ALL
USING (
    location_id = current_setting('app.local_id', true)::uuid
    OR EXISTS (
        SELECT 1 FROM public.staff 
        WHERE staff.auth_user_id = (select auth.uid())
          AND staff.location_id = waitlist.location_id
    )
)
WITH CHECK (
    location_id = current_setting('app.local_id', true)::uuid
    OR EXISTS (
        SELECT 1 FROM public.staff 
        WHERE staff.auth_user_id = (select auth.uid())
          AND staff.location_id = waitlist.location_id
    )
);

-- 6.11 staff
DROP POLICY IF EXISTS staff_staff_access ON public.staff;
CREATE POLICY staff_staff_access ON public.staff
FOR ALL
USING (location_id = current_setting('app.local_id', true)::uuid)
WITH CHECK (location_id = current_setting('app.local_id', true)::uuid);

-- 6.12 delivery_tokens
DROP POLICY IF EXISTS delivery_tokens_anon_read ON public.delivery_tokens;
CREATE POLICY delivery_tokens_anon_read ON public.delivery_tokens
FOR SELECT
USING (
    crypt(NULLIF(current_setting('app.token_plain', true), ''), token_hash) = token_hash
    AND used_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
);

DROP POLICY IF EXISTS delivery_tokens_anon_use ON public.delivery_tokens;
CREATE POLICY delivery_tokens_anon_use ON public.delivery_tokens
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

DROP POLICY IF EXISTS delivery_tokens_staff_access ON public.delivery_tokens;
CREATE POLICY delivery_tokens_staff_access ON public.delivery_tokens
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = delivery_tokens.order_id
          AND o.location_id = current_setting('app.local_id', true)::uuid
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = delivery_tokens.order_id
          AND o.location_id = current_setting('app.local_id', true)::uuid
    )
);

-- 6.13 discounts y usages
DROP POLICY IF EXISTS discounts_staff_access ON public.discounts;
CREATE POLICY discounts_staff_access ON public.discounts
FOR ALL
USING (location_id = current_setting('app.local_id', true)::uuid)
WITH CHECK (location_id = current_setting('app.local_id', true)::uuid);

DROP POLICY IF EXISTS discounts_public_read ON public.discounts;
CREATE POLICY discounts_public_read ON public.discounts
FOR SELECT
USING (
    is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
);

DROP POLICY IF EXISTS discount_usages_staff_access ON public.discount_usages;
CREATE POLICY discount_usages_staff_access ON public.discount_usages
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.discounts d
        WHERE d.id = discount_usages.discount_id
          AND d.location_id = current_setting('app.local_id', true)::uuid
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.discounts d
        WHERE d.id = discount_usages.discount_id
          AND d.location_id = current_setting('app.local_id', true)::uuid
    )
);

-- 6.14 allergens y diet_labels
DROP POLICY IF EXISTS allergens_public_read ON public.allergens;
CREATE POLICY allergens_public_read ON public.allergens
FOR SELECT USING (true);

DROP POLICY IF EXISTS diet_labels_public_read ON public.diet_labels;
CREATE POLICY diet_labels_public_read ON public.diet_labels
FOR SELECT USING (true);

DROP POLICY IF EXISTS product_allergens_staff_access ON public.product_allergens;
CREATE POLICY product_allergens_staff_access ON public.product_allergens
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id = product_allergens.product_id
          AND p.location_id = current_setting('app.local_id', true)::uuid
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id = product_allergens.product_id
          AND p.location_id = current_setting('app.local_id', true)::uuid
    )
);

DROP POLICY IF EXISTS product_allergens_public_read ON public.product_allergens;
CREATE POLICY product_allergens_public_read ON public.product_allergens
FOR SELECT USING (true);

DROP POLICY IF EXISTS product_diet_labels_staff_access ON public.product_diet_labels;
CREATE POLICY product_diet_labels_staff_access ON public.product_diet_labels
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id = product_diet_labels.product_id
          AND p.location_id = current_setting('app.local_id', true)::uuid
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id = product_diet_labels.product_id
          AND p.location_id = current_setting('app.local_id', true)::uuid
    )
);

DROP POLICY IF EXISTS product_diet_labels_public_read ON public.product_diet_labels;
CREATE POLICY product_diet_labels_public_read ON public.product_diet_labels
FOR SELECT USING (true);

-- 6.15 audit_log
DROP POLICY IF EXISTS audit_log_service_all ON public.audit_log;
DROP POLICY IF EXISTS audit_log_staff_read ON public.audit_log;
CREATE POLICY audit_log_staff_read ON public.audit_log
FOR SELECT USING (
    location_id = NULLIF(current_setting('app.local_id', true), '')::uuid
);


-- ============================================================================
-- 7. PRIVILEGIOS Y PERMISOS (GRANTS)
-- ============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Acceso público de lectura (Catálogo y datos de solo lectura)
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

-- locals: anon solo para ping de conectividad (/api/health); RLS oculta filas a anon
GRANT SELECT ON TABLE public.locals TO anon, authenticated;

-- orders: lectura solo para staff autenticado (Realtime de órdenes)
GRANT SELECT ON TABLE public.orders TO authenticated;

-- Mesas y turnos
GRANT SELECT ON TABLE public.restaurant_tables TO anon, authenticated;
GRANT ALL ON TABLE public.restaurant_tables TO authenticated, service_role;

GRANT SELECT ON TABLE public.local_shifts TO anon, authenticated;
GRANT ALL ON TABLE public.local_shifts TO authenticated, service_role;

-- waitlist: anon solo SELECT para suscripciones Realtime móviles
REVOKE INSERT, UPDATE, DELETE ON TABLE public.waitlist FROM anon;
GRANT SELECT ON TABLE public.waitlist TO anon;
GRANT ALL ON TABLE public.waitlist TO authenticated, service_role;

-- audit_log: solo staff autenticado y backend
GRANT SELECT ON TABLE public.audit_log TO authenticated;
GRANT ALL ON TABLE public.audit_log TO service_role;

-- service_role: bypass y control maestro para Server Actions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA auth TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA auth TO service_role;


-- ============================================================================
-- 8. ÍNDICES DE RENDIMIENTO Y BÚSQUEDA RÁPIDA
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_orders_location_status ON public.orders(location_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key ON public.orders(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_eta ON public.orders(eta);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON public.orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_driver ON public.orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_table_id ON public.orders(table_id);

CREATE INDEX IF NOT EXISTS idx_reservations_location_date ON public.reservations(location_id, reservation_date);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_table_id ON public.reservations(table_id);
CREATE INDEX IF NOT EXISTS idx_reservations_table_ids_gin ON public.reservations USING GIN (table_ids);
CREATE INDEX IF NOT EXISTS idx_reservations_table_date_status ON public.reservations (table_id, reservation_date, status);

CREATE INDEX IF NOT EXISTS idx_restaurant_tables_location ON public.restaurant_tables(location_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_location_zone_active ON public.restaurant_tables (location_id, zone, is_active);
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_qr_token ON public.restaurant_tables(qr_token);

CREATE INDEX IF NOT EXISTS idx_local_shifts_location ON public.local_shifts(location_id);

CREATE INDEX IF NOT EXISTS idx_waitlist_location_status ON public.waitlist(location_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_tracking_token ON public.waitlist(tracking_token);
CREATE INDEX IF NOT EXISTS idx_waitlist_table_ids_gin ON public.waitlist USING GIN (table_ids);

CREATE INDEX IF NOT EXISTS idx_staff_location ON public.staff(location_id);
CREATE INDEX IF NOT EXISTS idx_staff_auth_user_id ON public.staff(auth_user_id);

CREATE INDEX IF NOT EXISTS idx_delivery_tokens_order_id ON public.delivery_tokens(order_id);
CREATE INDEX IF NOT EXISTS idx_discounts_location_active ON public.discounts(location_id, is_active);
CREATE INDEX IF NOT EXISTS idx_product_allergens_product ON public.product_allergens(product_id);
CREATE INDEX IF NOT EXISTS idx_product_diet_labels_product ON public.product_diet_labels(product_id);
CREATE INDEX IF NOT EXISTS idx_discount_usages_discount ON public.discount_usages(discount_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_location_created ON public.audit_log(location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_staff ON public.audit_log(staff_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON public.audit_log(resource_type, resource_id);


-- ============================================================================
-- 9. VISTAS Y FUNCIONES RPC
-- ============================================================================

-- 9.1 Aforo dinámico por zona (calculado en tiempo real desde restaurant_tables)
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
    EXECUTE 'DROP TABLE public.local_zone_capacity CASCADE';
  ELSIF v_relkind = 'v' THEN
    EXECUTE 'DROP VIEW public.local_zone_capacity CASCADE';
  END IF;

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

-- 9.2 Vista segura para KDS/Caja: expone solo lo necesario sin PII sensible
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

-- 9.3 Función RPC para asignación de mesas ("Best-Fit" y mesas combinadas)
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


-- ============================================================================
-- 10. REALTIME (PUBLICACIÓN SUPABASE_REALTIME)
-- ============================================================================
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
-- 11. SUPABASE STORAGE (BUCKET MENU-IMAGES)
-- ============================================================================
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
-- 12. COMENTARIOS DE DOCUMENTACIÓN
-- ============================================================================
COMMENT ON TABLE public.locals IS 'Multi-tenant root: sucursales del restaurante indexadas por path /{slug}';
COMMENT ON COLUMN public.locals.iva_rate IS 'Tasa de IVA del local (0.16 = 16%). Ajustable por sucursal.';
COMMENT ON COLUMN public.locals.delivery_fee IS 'Tarifa fija base de delivery del local.';
COMMENT ON COLUMN public.locals.is_catalog_only IS 'Si es true, el menú es solo informativo/catálogo y no permite armar carritos ni pedidos.';
COMMENT ON COLUMN public.locals.reservations_enabled IS 'Si es false, las reservas de mesa en línea están pausadas para esta sucursal.';
COMMENT ON COLUMN public.staff.auth_user_id IS 'Referencia a auth.users.id para vinculación directa y consultas sin depender de email';
COMMENT ON TABLE public.orders IS 'Pedidos; snapshot con precios públicos (IVA incluido)';
COMMENT ON COLUMN public.orders.driver_id IS 'Repartidor asignado (staff). NULL = sin asignar.';
COMMENT ON COLUMN public.orders.cart_snapshot IS 'JSONB snapshot: items[] {product_id, product_name, base_price, quantity, modifiers[]}';
COMMENT ON COLUMN public.reservations.table_ids IS 'Mesas físicas secundarias unidas para grupos grandes.';
COMMENT ON TABLE public.delivery_tokens IS 'Token único de repartidor: EN_CAMINO -> COMPLETADO, un solo uso';
COMMENT ON TABLE public.discounts IS 'Motor de promociones: cupones o automáticas; no acumulables';
COMMENT ON TABLE public.waitlist IS 'Fila de espera virtual (walk-ins) con token de seguimiento';
COMMENT ON FUNCTION public.get_available_tables IS 'Retorna mesas físicas activas sin reservas solapadas que admiten el tamaño del grupo solicitado.';


-- ============================================================================
-- 13. PG_CRON: RECORDATORIOS DE RESERVAS (OPCIONAL / CONFIGURABLE)
-- ============================================================================
-- Requiere tener habilitadas las extensiones pg_cron y pg_net, y configurar
-- la GUC app.cron_secret o reemplazar por el endpoint de producción.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') AND
     EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    
    -- Schedule: Recordatorio 24h (cada hora al minuto 0)
    PERFORM cron.schedule(
      'reservation-reminders-24h',
      '0 * * * *',
      $cron$
      SELECT net.http_get(
        url := 'https://your-domain.vercel.app/api/cron/reminders/24h',
        headers := ('{"Authorization": "Bearer ' || COALESCE(current_setting('app.cron_secret', true), '') || '"}')::jsonb
      );
      $cron$
    );

    -- Schedule: Recordatorio 2h (cada hora al minuto 0)
    PERFORM cron.schedule(
      'reservation-reminders-2h',
      '0 * * * *',
      $cron$
      SELECT net.http_get(
        url := 'https://your-domain.vercel.app/api/cron/reminders/2h',
        headers := ('{"Authorization": "Bearer ' || COALESCE(current_setting('app.cron_secret', true), '') || '"}')::jsonb
      );
      $cron$
    );

  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron scheduler no configurado automáticamente (debe configurarse con dominio de producción si se usa): %', SQLERRM;
END $$;

-- Para desactivar o desprogramar crons de recordatorios si se usan Vercel Crons:
-- SELECT cron.unschedule('reservation-reminders-24h');
-- SELECT cron.unschedule('reservation-reminders-2h');
