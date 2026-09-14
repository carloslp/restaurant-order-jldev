-- Vista segura para staff: expone solo las columnas necesarias de orders
-- para KDS (cocina) y Caja, sin datos sensibles del cliente.
-- security_invoker = true → aplica RLS de la tabla subyacente (requiere la
-- policy orders_staff_live o el GUC app.local_id para el SELECT).
-- Ejecutar después de docs/policy-realtime-staff.sql.

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