-- Migration: asignación de repartidor (TODO 27)
-- ============================================================================
-- Agrega orders.driver_id (staff asignado al reparto) y lo expone en
-- staff_orders_view para que Caja lo vea en la carga inicial (Realtime ya lo
-- propaga en los UPDATE porque vienen de la tabla orders).
--
-- Idempotente. Ejecutar en Supabase → SQL Editor como postgres.
-- Sin esta migración, la UI de asignación devuelve "Error de configuración".
-- ============================================================================

-- 1. Columna + FK (SET NULL: si se elimina al repartidor, el pedido queda sin asignar)
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES staff(id) ON DELETE SET NULL;

COMMENT ON COLUMN orders.driver_id IS 'Repartidor asignado (staff). NULL = sin asignar.';

-- 2. Índice para "pedidos de mi repartidor"
CREATE INDEX IF NOT EXISTS idx_orders_driver ON orders(driver_id);

-- 3. RLS: el staff del local puede leer (la policy orders_staff_access FOR ALL
--    ya cubre location_id; solo asegurar la vista lo exponga). No se requiere
--    policy nueva: el update pasa por la misma orders_staff_access.

-- 4. Recrear la vista segura incluyendo driver_id
DROP VIEW IF EXISTS staff_orders_view;

CREATE VIEW staff_orders_view
WITH (security_invoker = true)
AS
SELECT
    o.id,
    o.location_id,
    o.customer_name,                -- solo nombre (sin teléfono)
    o.order_type,
    o.payment_method,
    -- Dirección resumida: solo si es delivery; sin referencias ni calle completa.
    CASE
        WHEN o.order_type = 'DOMICILIO' AND o.delivery_address IS NOT NULL
        THEN o.delivery_address
        ELSE NULL
    END AS delivery_address_short,
    o.driver_id,                    -- repartidor asignado (o NULL)
    o.eta,
    o.status,
    o.payment_status,
    o.subtotal,
    o.iva_amount,
    o.delivery_fee_amount,
    o.total,
    o.cart_snapshot,                -- items con modificadores (para cocina)
    o.delivery_zone,
    o.delivered_at,
    o.created_at,
    o.updated_at
FROM orders o;

-- 5. Grants de la vista (igual que antes)
GRANT SELECT ON staff_orders_view TO anon, authenticated;
GRANT SELECT ON staff_orders_view TO service_role;

-- 6. Verificación
-- SELECT driver_id FROM orders LIMIT 1;  (no debe dar error)
