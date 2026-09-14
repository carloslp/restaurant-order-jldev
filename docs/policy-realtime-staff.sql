-- Policy extra para que el staff autenticado lea órdenes del local en tiempo real.
-- Ejecutar en el SQL Editor de Supabase después de docs/schema.sql.
--
-- Contexto: la policy original (orders_staff_access) exige el GUC app.local_id,
-- que solo puede setear el servidor. Para que el browser (Realtime postgres_changes)
-- reciba eventos de orders del local, el JWT del staff debe bastar para SELECT.
-- Esta policy permite SELECT si el location_id coincide con:
--   1) el GUC app.local_id (flujo servidor), o
--   2) el claim user_metadata->location_id del JWT (staff con magic link).
-- Las escrituras siguen protegidas por la policy original (GUC/service role).

DROP POLICY IF EXISTS orders_staff_live ON orders;

CREATE POLICY orders_staff_live ON orders
FOR SELECT
USING (
    location_id = COALESCE(
        NULLIF(current_setting('app.local_id', true), ''),
        (auth.jwt() -> 'user_metadata' ->> 'location_id')
    )::uuid
);