-- Policy extra para que el staff autenticado lea órdenes del local en tiempo real.
-- Ejecutar en el SQL Editor de Supabase después de docs/schema.sql.
--
-- Contexto: la policy original (orders_staff_access) exige el GUC app.local_id,
-- que solo puede setear el servidor. Para que el browser (Realtime postgres_changes)
-- reciba eventos de orders del local, el JWT del staff debe bastar para SELECT.
-- Esta policy permite SELECT si el location_id coincide con:
--   1) el GUC app.local_id (flujo servidor), o
--   2) la relación verificada del usuario en public.staff (auth.uid() = staff.auth_user_id).
-- Las escrituras siguen protegidas por la policy original (GUC/service role).

DROP POLICY IF EXISTS orders_staff_live ON orders;

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