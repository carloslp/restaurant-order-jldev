-- ============================================================================
-- restaurant-order-jldev — Instalación limpia en un solo archivo
-- ============================================================================
-- Ejecutar en el SQL Editor de Supabase (rol postgres) sobre un proyecto nuevo.
-- Orden: extensiones → tipos → tablas → triggers updated_at → auth sync →
--        RLS + policies → índices → vistas → pg_cron → seed demo.
--
-- El archivo `diagnostico-seed.sql` queda aparte (herramienta de diagnóstico).
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

CREATE TYPE order_type AS ENUM ('RECOGER', 'DOMICILIO');

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

-- ============================================================================
-- 3. TABLAS
-- ============================================================================

-- 3.1 Multi-tenant root
CREATE TABLE locals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    subdomain TEXT UNIQUE NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'America/Mexico_City',
    iva_rate NUMERIC(5,4) NOT NULL DEFAULT 0.16,
    delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.2 Catálogo (4 niveles)
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
    max_selections INTEGER NOT NULL DEFAULT 0 CHECK (max_selections >= min_selections),
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

-- 3.4 Pedidos
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locals(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    order_type order_type NOT NULL,
    payment_method payment_method NOT NULL,
    delivery_address TEXT,
    delivery_references TEXT,
    eta TIMESTAMPTZ NOT NULL,
    status order_status NOT NULL DEFAULT 'CREADO',
    payment_status payment_status NOT NULL DEFAULT 'PENDIENTE',
    subtotal NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0),
    iva_amount NUMERIC(10,2) NOT NULL CHECK (iva_amount >= 0),
    delivery_fee_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (delivery_fee_amount >= 0),
    total NUMERIC(10,2) NOT NULL CHECK (total >= 0),
    cart_snapshot JSONB NOT NULL,
    delivery_zone TEXT NULL,
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
        (order_type = 'RECOGER' AND delivery_address IS NULL)
    ),
    CONSTRAINT chk_eta_future CHECK (eta > now()),
    CONSTRAINT chk_total_consistency CHECK (
        ABS(total - (subtotal + delivery_fee_amount)) < 0.01
    )
);

-- 3.5 Reservas
CREATE TABLE reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locals(id) ON DELETE CASCADE,
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

-- 3.8 Alérgenos y etiquetas dietarias
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

-- ============================================================================
-- 4. TRIGGER updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'locals','categories','products','modifier_groups','modifier_options',
        'orders','reservations','staff','discounts'
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
-- 5. AUTH SYNC: vincular auth.users ↔ staff por email
-- ============================================================================

-- 5.1 Vincular staff existente por email (uso manual tras migrar usuarios)
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

-- 5.2 Trigger en staff: al insertar/actualizar, vincular si coincide email
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

-- 5.3 Trigger inverso: al crear usuario auth, vincular staff pendiente
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

-- Patrón GUC: el backend setea 'app.local_id' (y 'app.token_plain' si aplica)
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
USING (is_active = true);

CREATE POLICY products_staff_access ON products
FOR ALL
USING (location_id = current_setting('app.local_id', true)::uuid)
WITH CHECK (location_id = current_setting('app.local_id', true)::uuid);

CREATE POLICY products_public_read ON products
FOR SELECT
USING (is_available = true);

CREATE POLICY modifier_groups_staff_access ON modifier_groups
FOR ALL
USING (location_id = current_setting('app.local_id', true)::uuid)
WITH CHECK (location_id = current_setting('app.local_id', true)::uuid);

CREATE POLICY modifier_groups_public_read ON modifier_groups
FOR SELECT
USING (true);

CREATE POLICY modifier_options_staff_access ON modifier_options
FOR ALL
USING (location_id = current_setting('app.local_id', true)::uuid)
WITH CHECK (location_id = current_setting('app.local_id', true)::uuid);

CREATE POLICY modifier_options_public_read ON modifier_options
FOR SELECT
USING (is_active = true);

CREATE POLICY orders_staff_access ON orders
FOR ALL
USING (location_id = current_setting('app.local_id', true)::uuid)
WITH CHECK (location_id = current_setting('app.local_id', true)::uuid);

-- Realtime: permite SELECT al staff autenticado vía JWT (claim user_metadata.location_id)
CREATE POLICY orders_staff_live ON orders
FOR SELECT
USING (
    location_id = COALESCE(
        NULLIF(current_setting('app.local_id', true), ''),
        (auth.jwt() -> 'user_metadata' ->> 'location_id')
    )::uuid
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

-- ============================================================================
-- 7. ÍNDICES
-- ============================================================================
CREATE INDEX idx_orders_location_status ON orders(location_id, status);
CREATE INDEX idx_orders_eta ON orders(eta);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_customer_phone ON orders(customer_phone);
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
-- security_invoker = true → aplica RLS de la tabla subyacente.
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
    o.delivered_at,
    o.created_at,
    o.updated_at
FROM orders o;

-- ============================================================================
-- 9. COMENTARIOS
-- ============================================================================
COMMENT ON TABLE locals IS 'Multi-tenant root: cada local/restaurante';
COMMENT ON COLUMN locals.iva_rate IS 'Tasa de IVA del local (0.16 = 16%). Ajustable por local.';
COMMENT ON COLUMN locals.delivery_fee IS 'Tarifa fija de delivery del local (v1). Futuro: por zona vía OSRM.';
COMMENT ON COLUMN staff.auth_user_id IS 'Referencia a auth.users.id para vinculación directa y consultas sin depender de email';
COMMENT ON TABLE orders IS 'Pedidos; snapshot con precios públicos (IVA incluido)';
COMMENT ON COLUMN orders.cart_snapshot IS 'JSONB schema fijo: items[] {product_id, product_name, base_price (IVA incl.), quantity, modifiers[{group, selections[]}]}';
COMMENT ON COLUMN orders.iva_amount IS 'IVA interno para contabilidad: subtotal * rate/(1+rate). No se suma al público.';
COMMENT ON TABLE delivery_tokens IS 'Token único de repartidor: EN_CAMINO -> COMPLETADO, un solo uso';
COMMENT ON TABLE discounts IS 'Engine de promos: códigos o automáticas con reglas; sin apilar';

-- ============================================================================
-- Permisos para service_role (bypass RLS en operaciones server-side)
-- ============================================================================
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- También grant en auth schema para gestión de usuarios si se necesita
GRANT USAGE ON SCHEMA auth TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA auth TO service_role;

-- ============================================================================
-- 10. PG_CRON: recordatorios de reservaciones (opcional)
-- ============================================================================
-- Requiere definir la GUC app.cron_secret en Supabase (Settings → Database →
-- Custom Configuration o vía supabase secrets).
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
-- 11. SEED DEMO
-- ============================================================================
-- Crea: 1 local demo (subdomain 'localhost' para dev), staff, catálogo,
-- alérgenos, etiquetas dietarias, modificadores y aforo por zona.

DO $$
DECLARE
    v_local UUID;
    v_admin UUID;
    v_cajero UUID;
    v_cocinero UUID;
    v_cat_hamburguesas UUID;
    v_cat_acompanamientos UUID;
    v_cat_bebidas UUID;
    v_cat_postres UUID;
    v_prod_clasica UUID;
    v_prod_doble UUID;
    v_prod_veggie UUID;
    v_prod_papas UUID;
    v_prod_aros UUID;
    v_prod_refresco UUID;
    v_prod_agua UUID;
    v_prod_cerveza UUID;
    v_prod_brownie UUID;
    v_prod_cheesecake UUID;
    v_grp_termino UUID;
    v_grp_extras UUID;
    v_grp_salsas UUID;
BEGIN
    -- Local demo
    INSERT INTO locals (name, subdomain, timezone, iva_rate, delivery_fee)
    VALUES ('Restaurante Demo JLDev', 'localhost', 'America/Mexico_City', 0.16, 30.00)
    RETURNING id INTO v_local;

    -- Staff
    INSERT INTO staff (location_id, email, full_name, is_active)
    VALUES
        (v_local, 'admin@demo.com',   'Admin Demo',   true),
        (v_local, 'cajero@demo.com',  'Cajero Demo',  true),
        (v_local, 'cocina@demo.com',  'Cocina Demo',  true);

    SELECT id INTO v_admin FROM staff WHERE email = 'admin@demo.com' AND location_id = v_local;
    SELECT id INTO v_cajero FROM staff WHERE email = 'cajero@demo.com' AND location_id = v_local;
    SELECT id INTO v_cocinero FROM staff WHERE email = 'cocina@demo.com' AND location_id = v_local;

    -- Alérgenos (NOM-050)
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
        ('ALT_TRIGO', 'Altramuces')
    ON CONFLICT (name) DO NOTHING;

    -- Etiquetas dietarias
    INSERT INTO diet_labels (name, description) VALUES
        ('VEGETARIANO', 'Sin carne'),
        ('VEGANO', 'Sin ingredientes de origen animal'),
        ('SIN_GLUTEN', NULL),
        ('SIN_LACTOSA', NULL),
        ('PICANTE', NULL)
    ON CONFLICT (name) DO NOTHING;

    -- Categorías
    INSERT INTO categories (location_id, name, description, sort_order) VALUES
        (v_local, 'Hamburguesas', 'Nuestras clásicas', 1),
        (v_local, 'Acompañamientos', 'Papas, aros y más', 2),
        (v_local, 'Bebidas', 'Refrescos, agua, cerveza', 3),
        (v_local, 'Postres', 'Para terminar bien', 4);

    SELECT id INTO v_cat_hamburguesas FROM categories WHERE name = 'Hamburguesas' AND location_id = v_local;
    SELECT id INTO v_cat_acompanamientos FROM categories WHERE name = 'Acompañamientos' AND location_id = v_local;
    SELECT id INTO v_cat_bebidas FROM categories WHERE name = 'Bebidas' AND location_id = v_local;
    SELECT id INTO v_cat_postres FROM categories WHERE name = 'Postres' AND location_id = v_local;

    -- Productos (precios públicos con IVA incluido)
    INSERT INTO products (location_id, category_id, name, description, base_price) VALUES
        (v_local, v_cat_hamburguesas, 'Clásica', 'Carne 100% res, queso americano, lechuga, jitomate, cebolla y nuestra salsa', 95.00),
        (v_local, v_cat_hamburguesas, 'Doble', 'Dos carnes, doble queso, tocino y salsa especial', 130.00),
        (v_local, v_cat_hamburguesas, 'Veggie', 'Patty de garbanzo, aguacate, espinaca y mayonesa vegana', 110.00),
        (v_local, v_cat_acompanamientos, 'Papas a la francesa', 'Crujientes, con sal de mar', 45.00),
        (v_local, v_cat_acompanamientos, 'Aros de cebolla', 'Rebozados y dorados', 50.00),
        (v_local, v_cat_bebidas, 'Refresco de cola', 'Lata 355ml', 35.00),
        (v_local, v_cat_bebidas, 'Agua mineral', 'Botella 600ml', 25.00),
        (v_local, v_cat_bebidas, 'Cerveza artesanal', 'Pinta 473ml', 60.00),
        (v_local, v_cat_postres, 'Brownie con nuez', 'Con helado de vainilla', 40.00),
        (v_local, v_cat_postres, 'Cheesecake', 'Con frutos rojos', 55.00);

    SELECT id INTO v_prod_clasica FROM products WHERE name = 'Clásica' AND location_id = v_local;
    SELECT id INTO v_prod_doble FROM products WHERE name = 'Doble' AND location_id = v_local;
    SELECT id INTO v_prod_veggie FROM products WHERE name = 'Veggie' AND location_id = v_local;
    SELECT id INTO v_prod_papas FROM products WHERE name = 'Papas a la francesa' AND location_id = v_local;
    SELECT id INTO v_prod_aros FROM products WHERE name = 'Aros de cebolla' AND location_id = v_local;
    SELECT id INTO v_prod_refresco FROM products WHERE name = 'Refresco de cola' AND location_id = v_local;
    SELECT id INTO v_prod_agua FROM products WHERE name = 'Agua mineral' AND location_id = v_local;
    SELECT id INTO v_prod_cerveza FROM products WHERE name = 'Cerveza artesanal' AND location_id = v_local;
    SELECT id INTO v_prod_brownie FROM products WHERE name = 'Brownie con nuez' AND location_id = v_local;
    SELECT id INTO v_prod_cheesecake FROM products WHERE name = 'Cheesecake' AND location_id = v_local;

    -- Modificadores: término de la carne (obligatorio, 1)
    INSERT INTO modifier_groups (location_id, product_id, name, is_required, min_selections, max_selections)
    VALUES
        (v_local, v_prod_clasica, 'Término de la carne', TRUE, 1, 1),
        (v_local, v_prod_doble,  'Término de la carne', TRUE, 1, 1),
        (v_local, v_prod_veggie, 'Término de la carne', TRUE, 1, 1);

    -- Extras (opcional, hasta 3)
    INSERT INTO modifier_groups (location_id, product_id, name, is_required, min_selections, max_selections)
    VALUES
        (v_local, v_prod_clasica, 'Extras', FALSE, 0, 3),
        (v_local, v_prod_doble,  'Extras', FALSE, 0, 3),
        (v_local, v_prod_veggie, 'Extras', FALSE, 0, 3);

    -- Salsas (opcional, hasta 2)
    INSERT INTO modifier_groups (location_id, product_id, name, is_required, min_selections, max_selections)
    VALUES
        (v_local, v_prod_clasica, 'Salsas', FALSE, 0, 2),
        (v_local, v_prod_doble,  'Salsas', FALSE, 0, 2),
        (v_local, v_prod_veggie, 'Salsas', FALSE, 0, 2);

    -- Opciones de término
    FOR v_grp_termino IN SELECT id FROM modifier_groups WHERE name = 'Término de la carne' AND location_id = v_local LOOP
        INSERT INTO modifier_options (location_id, modifier_group_id, name, price_impact) VALUES
            (v_local, v_grp_termino, 'Término medio', 0),
            (v_local, v_grp_termino, '3/4', 0),
            (v_local, v_grp_termino, 'Bien cocida', 0);
    END LOOP;

    -- Opciones de extras
    FOR v_grp_extras IN SELECT id FROM modifier_groups WHERE name = 'Extras' AND location_id = v_local LOOP
        INSERT INTO modifier_options (location_id, modifier_group_id, name, price_impact) VALUES
            (v_local, v_grp_extras, 'Queso extra', 15),
            (v_local, v_grp_extras, 'Tocino', 20),
            (v_local, v_grp_extras, 'Huevo', 10),
            (v_local, v_grp_extras, 'Guacamole', 25);
    END LOOP;

    -- Opciones de salsas
    FOR v_grp_salsas IN SELECT id FROM modifier_groups WHERE name = 'Salsas' AND location_id = v_local LOOP
        INSERT INTO modifier_options (location_id, modifier_group_id, name, price_impact) VALUES
            (v_local, v_grp_salsas, 'BBQ', 5),
            (v_local, v_grp_salsas, 'Chipotle', 5),
            (v_local, v_grp_salsas, 'Mostaza miel', 5);
    END LOOP;

    -- Alérgenos por producto
    INSERT INTO product_allergens (product_id, allergen_id)
    SELECT v_prod_clasica, id FROM allergens WHERE name IN ('GLUTEN', 'LACTEOS') ON CONFLICT DO NOTHING;
    INSERT INTO product_allergens (product_id, allergen_id)
    SELECT v_prod_veggie, id FROM allergens WHERE name = 'GLUTEN' ON CONFLICT DO NOTHING;
    INSERT INTO product_allergens (product_id, allergen_id)
    SELECT v_prod_brownie, id FROM allergens WHERE name IN ('GLUTEN', 'LACTEOS', 'FRUTOS_SECOS') ON CONFLICT DO NOTHING;
    INSERT INTO product_allergens (product_id, allergen_id)
    SELECT v_prod_cheesecake, id FROM allergens WHERE name = 'LACTEOS' ON CONFLICT DO NOTHING;

    -- Etiquetas dietarias por producto
    INSERT INTO product_diet_labels (product_id, diet_label_id)
    SELECT v_prod_veggie, id FROM diet_labels WHERE name IN ('VEGETARIANO', 'VEGANO') ON CONFLICT DO NOTHING;
    INSERT INTO product_diet_labels (product_id, diet_label_id)
    SELECT v_prod_cheesecake, id FROM diet_labels WHERE name = 'VEGETARIANO' ON CONFLICT DO NOTHING;

    -- Aforo por zona
    INSERT INTO local_zone_capacity (location_id, zone, capacity) VALUES
        (v_local, 'INTERIOR', 30),
        (v_local, 'TERRAZA', 20),
        (v_local, 'BARRA', 8);

    RAISE NOTICE 'Seed listo. Local demo: % (subdomain localhost)', v_local;
END $$;
