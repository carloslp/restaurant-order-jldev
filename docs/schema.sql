-- Schema for restaurant-order-jldev
-- Multi-tenant, Supabase PostgreSQL (PG 13+)
-- Run in a fresh Supabase project via SQL Editor, or via `supabase db push` / psql.

-- Prereqs (already present in Supabase, kept for portability)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- crypt() for delivery tokens

-- ---------------------------------------------------------------------------
-- Enumerated Types
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Locals (multi-tenant root)
-- ---------------------------------------------------------------------------
CREATE TABLE locals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    subdomain TEXT UNIQUE NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'America/Mexico_City',
    iva_rate NUMERIC(5,4) NOT NULL DEFAULT 0.16,      -- 0.16 = 16%, ajustable por local
    delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0), -- tarifa fija de delivery por local
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Catalog (4 levels)
-- ---------------------------------------------------------------------------
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
    base_price NUMERIC(10,2) NOT NULL CHECK (base_price >= 0),  -- precio público: IVA incluido
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
    max_selections INTEGER NOT NULL DEFAULT 0 CHECK (max_selections >= min_selections), -- 0 = sin límite
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(location_id, product_id, name)
);

CREATE TABLE modifier_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locals(id) ON DELETE CASCADE,
    modifier_group_id UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price_impact NUMERIC(10,2) NOT NULL DEFAULT 0.00,  -- impacto en precio público (IVA incluido)
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(location_id, modifier_group_id, name)
);

-- ---------------------------------------------------------------------------
-- Staff (must exist before orders/reservations/discounts reference it)
-- ---------------------------------------------------------------------------
CREATE TABLE staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locals(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by UUID REFERENCES staff(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES staff(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
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
    -- Totales: precios públicos con IVA incluido.
    -- subtotal = suma de precios (IVA incluido); total = subtotal + delivery_fee_amount.
    subtotal NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0),
    iva_amount NUMERIC(10,2) NOT NULL CHECK (iva_amount >= 0),   -- IVA interno = subtotal * rate/(1+rate)
    delivery_fee_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (delivery_fee_amount >= 0),
    total NUMERIC(10,2) NOT NULL CHECK (total >= 0),
    cart_snapshot JSONB NOT NULL,
    delivery_zone TEXT NULL,               -- preparado para tarifas por zona futuras
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

-- ---------------------------------------------------------------------------
-- Reservations
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Delivery tokens (single-use, hash-only)
-- ---------------------------------------------------------------------------
CREATE TABLE delivery_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,              -- hash del token plano enviado por link
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ NULL,
    revoked_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Discounts (engine completo: códigos + automáticas + manual)
-- ---------------------------------------------------------------------------
CREATE TABLE discounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locals(id) ON DELETE CASCADE,
    code TEXT UNIQUE,                      -- NULL = promo automática
    description TEXT NOT NULL,
    discount_type discount_type NOT NULL,
    value NUMERIC(10,2) NOT NULL CHECK (value >= 0),
    min_purchase NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (min_purchase >= 0),
    applies_to_product_ids UUID[],
    applies_to_category_ids UUID[],
    starts_at TIMESTAMPTZ NULL,
    ends_at TIMESTAMPTZ NULL,
    days_of_week INTEGER[] NULL,           -- 0=Dom..6=Sáb, NULL = todos
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

-- ---------------------------------------------------------------------------
-- Allergens & diet labels
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Trigger genérico: updated_at (solo tablas que tienen la columna)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
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

-- NOTA (patrón GUC):
-- El middleware/Server Action debe ejecutar set_config('app.local_id', <uuid>, true)
-- (y 'app.token_plain' para el flujo de repartidor) ANTES de las consultas.
-- current_setting(x, true) = no lanza error si la GUC no está definida (devuelve NULL).

-- Locals: staff ve/edita solo su propio local
CREATE POLICY locals_staff_access ON locals
FOR ALL
USING (id = current_setting('app.local_id', true)::uuid)
WITH CHECK (id = current_setting('app.local_id', true)::uuid);

-- Categorías: staff (su local) + público puede leer activas (menú)
CREATE POLICY categories_staff_access ON categories
FOR ALL
USING (location_id = current_setting('app.local_id', true)::uuid)
WITH CHECK (location_id = current_setting('app.local_id', true)::uuid);

CREATE POLICY categories_public_read ON categories
FOR SELECT
USING (is_active = true);

-- Productos: staff (su local) + público puede leer disponibles
CREATE POLICY products_staff_access ON products
FOR ALL
USING (location_id = current_setting('app.local_id', true)::uuid)
WITH CHECK (location_id = current_setting('app.local_id', true)::uuid);

CREATE POLICY products_public_read ON products
FOR SELECT
USING (is_available = true);

-- Grupos y opciones: staff + público (para que el menú muestre modificadores)
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

-- Pedidos: staff del local (escrituras del checkout público van por Server Action con service_role, que salta RLS)
CREATE POLICY orders_staff_access ON orders
FOR ALL
USING (location_id = current_setting('app.local_id', true)::uuid)
WITH CHECK (location_id = current_setting('app.local_id', true)::uuid);

-- Reservas: staff del local (alta por Server Action / service_role)
CREATE POLICY reservations_staff_access ON reservations
FOR ALL
USING (location_id = current_setting('app.local_id', true)::uuid)
WITH CHECK (location_id = current_setting('app.local_id', true)::uuid);

-- Aforo por zona: staff + público lee (para indicador de disponibilidad en landing)
CREATE POLICY local_zone_capacity_staff_access ON local_zone_capacity
FOR ALL
USING (location_id = current_setting('app.local_id', true)::uuid)
WITH CHECK (location_id = current_setting('app.local_id', true)::uuid);

CREATE POLICY local_zone_capacity_public_read ON local_zone_capacity
FOR SELECT
USING (true);

-- Staff: cada uno ve el staff de su local (la alta se hace con service_role)
CREATE POLICY staff_staff_access ON staff
FOR ALL
USING (location_id = current_setting('app.local_id', true)::uuid)
WITH CHECK (location_id = current_setting('app.local_id', true)::uuid);

-- Tokens de repartidor:
--  * anónimo: solo puede leer/marcar usado si presenta el token plano (GUC app.token_plain)
--    y no está usado/revocado/expirado
--  * staff del local: gestión completa (regenerar, revocar)
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

-- Descuentos: staff (su local) + público lee códigos activos en ventana (para aplicar en checkout)
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

-- Usos de descuento: staff del local (vía join a discounts)
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

-- Alérgenos / etiquetas: lectura pública (datos estáticos)
CREATE POLICY allergens_public_read ON allergens
FOR SELECT USING (true);

CREATE POLICY diet_labels_public_read ON diet_labels
FOR SELECT USING (true);

-- Relaciones producto↔alérgeno/etiqueta: staff (vía local del producto) + público (ficha del menú)
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

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------
CREATE INDEX idx_orders_location_status ON orders(location_id, status);
CREATE INDEX idx_orders_eta ON orders(eta);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_customer_phone ON orders(customer_phone);
CREATE INDEX idx_reservations_location_date ON reservations(location_id, reservation_date);
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_staff_location ON staff(location_id);
CREATE INDEX idx_delivery_tokens_order_id ON delivery_tokens(order_id);
CREATE INDEX idx_discounts_location_active ON discounts(location_id, is_active);
CREATE INDEX idx_product_allergens_product ON product_allergens(product_id);
CREATE INDEX idx_product_diet_labels_product ON product_diet_labels(product_id);
CREATE INDEX idx_discount_usages_discount ON discount_usages(discount_id);

-- ---------------------------------------------------------------------------
-- Comentarios
-- ---------------------------------------------------------------------------
COMMENT ON TABLE locals IS 'Multi-tenant root: cada local/restaurante';
COMMENT ON COLUMN locals.iva_rate IS 'Tasa de IVA del local (0.16 = 16%). Ajustable por local.';
COMMENT ON COLUMN locals.delivery_fee IS 'Tarifa fija de delivery del local (v1). Futuro: por zona vía OSRM.';
COMMENT ON TABLE orders IS 'Pedidos; snapshot con precios públicos (IVA incluido)';
COMMENT ON COLUMN orders.cart_snapshot IS 'JSONB schema fijo: items[] {product_id, product_name, base_price (IVA incl.), quantity, modifiers[{group, selections[]}]}';
COMMENT ON COLUMN orders.iva_amount IS 'IVA interno para contabilidad: subtotal * rate/(1+rate). No se suma al público.';
COMMENT ON TABLE delivery_tokens IS 'Token único de repartidor: EN_CAMINO -> COMPLETADO, un solo uso';
COMMENT ON TABLE discounts IS 'Engine de promos: códigos o automáticas con reglas; sin apilar';