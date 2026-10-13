-- ============================================================================
-- docs/fix-supabase-linter-warnings.sql
-- ============================================================================
-- Remedia advertencias del Supabase Database Linter:
-- 1. auth_rls_initplan:
--    Envuelve llamadas a `current_setting(...)` y `auth.uid()` con `(SELECT ...)`
--    para evitar re-evaluación por cada fila en PostgreSQL.
--
-- 2. multiple_permissive_policies:
--    Restringe policies staff (`*_staff_access`) al rol `authenticated` para
--    eliminar solapamiento con policies públicas (`*_public_read`) en roles
--    `anon`, `authenticator`, etc.
--    Elimina solapamiento en `orders` (`orders_staff_access` vs `orders_staff_live`)
--    y en `delivery_tokens` (`delivery_tokens_staff_access` vs `delivery_tokens_anon_*`).
--
-- Totalmente IDEMPOTENTE: puede ejecutarse múltiples veces en Supabase SQL Editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. LOCALS
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS locals_staff_access ON public.locals;
CREATE POLICY locals_staff_access ON public.locals
FOR ALL
TO authenticated
USING (id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid))
WITH CHECK (id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid));


-- ----------------------------------------------------------------------------
-- 2. CATEGORIES
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS categories_staff_access ON public.categories;
CREATE POLICY categories_staff_access ON public.categories
FOR ALL
TO authenticated
USING (location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid))
WITH CHECK (location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid));

DROP POLICY IF EXISTS categories_public_read ON public.categories;
CREATE POLICY categories_public_read ON public.categories
FOR SELECT
TO anon
USING (is_active = true);


-- ----------------------------------------------------------------------------
-- 3. PRODUCTS
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS products_staff_access ON public.products;
CREATE POLICY products_staff_access ON public.products
FOR ALL
TO authenticated
USING (location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid))
WITH CHECK (location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid));

DROP POLICY IF EXISTS products_public_read ON public.products;
CREATE POLICY products_public_read ON public.products
FOR SELECT
TO anon
USING (true);


-- ----------------------------------------------------------------------------
-- 4. MODIFIER_GROUPS
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS modifier_groups_staff_access ON public.modifier_groups;
CREATE POLICY modifier_groups_staff_access ON public.modifier_groups
FOR ALL
TO authenticated
USING (location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid))
WITH CHECK (location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid));

DROP POLICY IF EXISTS modifier_groups_public_read ON public.modifier_groups;
CREATE POLICY modifier_groups_public_read ON public.modifier_groups
FOR SELECT
TO anon
USING (true);


-- ----------------------------------------------------------------------------
-- 5. MODIFIER_OPTIONS
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS modifier_options_staff_access ON public.modifier_options;
CREATE POLICY modifier_options_staff_access ON public.modifier_options
FOR ALL
TO authenticated
USING (location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid))
WITH CHECK (location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid));

DROP POLICY IF EXISTS modifier_options_public_read ON public.modifier_options;
CREATE POLICY modifier_options_public_read ON public.modifier_options
FOR SELECT
TO anon
USING (true);


-- ----------------------------------------------------------------------------
-- 6. ORDERS
-- ----------------------------------------------------------------------------
-- Unificamos SELECT y mutaciones en `orders_staff_access` para authenticated
-- eliminando la redundancia de `orders_staff_live`.
DROP POLICY IF EXISTS orders_staff_live ON public.orders;
DROP POLICY IF EXISTS orders_staff_access ON public.orders;

CREATE POLICY orders_staff_access ON public.orders
FOR ALL
TO authenticated
USING (
    location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid)
    OR EXISTS (
        SELECT 1 FROM public.staff 
        WHERE staff.auth_user_id = (SELECT auth.uid())
          AND staff.location_id = orders.location_id
    )
)
WITH CHECK (
    location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid)
    OR EXISTS (
        SELECT 1 FROM public.staff 
        WHERE staff.auth_user_id = (SELECT auth.uid())
          AND staff.location_id = orders.location_id
    )
);


-- ----------------------------------------------------------------------------
-- 7. RESERVATIONS
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS reservations_staff_access ON public.reservations;
CREATE POLICY reservations_staff_access ON public.reservations
FOR ALL
TO authenticated
USING (location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid))
WITH CHECK (location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid));


-- ----------------------------------------------------------------------------
-- 8. RESTAURANT_TABLES
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS restaurant_tables_staff_access ON public.restaurant_tables;
CREATE POLICY restaurant_tables_staff_access ON public.restaurant_tables
FOR ALL
TO authenticated
USING (
    location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid)
    OR EXISTS (
        SELECT 1 FROM public.staff 
        WHERE staff.auth_user_id = (SELECT auth.uid())
          AND staff.location_id = restaurant_tables.location_id
    )
)
WITH CHECK (
    location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid)
    OR EXISTS (
        SELECT 1 FROM public.staff 
        WHERE staff.auth_user_id = (SELECT auth.uid())
          AND staff.location_id = restaurant_tables.location_id
    )
);

DROP POLICY IF EXISTS restaurant_tables_public_read ON public.restaurant_tables;
CREATE POLICY restaurant_tables_public_read ON public.restaurant_tables
FOR SELECT
TO anon
USING (true);


-- ----------------------------------------------------------------------------
-- 9. LOCAL_SHIFTS
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS local_shifts_staff_access ON public.local_shifts;
CREATE POLICY local_shifts_staff_access ON public.local_shifts
FOR ALL
TO authenticated
USING (
    location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid)
    OR EXISTS (
        SELECT 1 FROM public.staff 
        WHERE staff.auth_user_id = (SELECT auth.uid())
          AND staff.location_id = local_shifts.location_id
    )
)
WITH CHECK (
    location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid)
    OR EXISTS (
        SELECT 1 FROM public.staff 
        WHERE staff.auth_user_id = (SELECT auth.uid())
          AND staff.location_id = local_shifts.location_id
    )
);

DROP POLICY IF EXISTS local_shifts_public_read ON public.local_shifts;
CREATE POLICY local_shifts_public_read ON public.local_shifts
FOR SELECT
TO anon
USING (true);


-- ----------------------------------------------------------------------------
-- 10. WAITLIST
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS waitlist_staff_access ON public.waitlist;
CREATE POLICY waitlist_staff_access ON public.waitlist
FOR ALL
TO authenticated
USING (
    location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid)
    OR EXISTS (
        SELECT 1 FROM public.staff 
        WHERE staff.auth_user_id = (SELECT auth.uid())
          AND staff.location_id = waitlist.location_id
    )
)
WITH CHECK (
    location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid)
    OR EXISTS (
        SELECT 1 FROM public.staff 
        WHERE staff.auth_user_id = (SELECT auth.uid())
          AND staff.location_id = waitlist.location_id
    )
);

DROP POLICY IF EXISTS waitlist_public_read ON public.waitlist;
CREATE POLICY waitlist_public_read ON public.waitlist
FOR SELECT
TO anon
USING (true);


-- ----------------------------------------------------------------------------
-- 11. STAFF
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS staff_staff_access ON public.staff;
CREATE POLICY staff_staff_access ON public.staff
FOR ALL
TO authenticated
USING (location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid))
WITH CHECK (location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid));


-- ----------------------------------------------------------------------------
-- 12. DELIVERY_TOKENS
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS delivery_tokens_staff_access ON public.delivery_tokens;
CREATE POLICY delivery_tokens_staff_access ON public.delivery_tokens
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = delivery_tokens.order_id
          AND o.location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid)
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = delivery_tokens.order_id
          AND o.location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid)
    )
);

DROP POLICY IF EXISTS delivery_tokens_anon_read ON public.delivery_tokens;
CREATE POLICY delivery_tokens_anon_read ON public.delivery_tokens
FOR SELECT
TO anon
USING (
    crypt((SELECT NULLIF(current_setting('app.token_plain', true), '')), token_hash) = token_hash
    AND used_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
);

DROP POLICY IF EXISTS delivery_tokens_anon_use ON public.delivery_tokens;
CREATE POLICY delivery_tokens_anon_use ON public.delivery_tokens
FOR UPDATE
TO anon
USING (
    crypt((SELECT NULLIF(current_setting('app.token_plain', true), '')), token_hash) = token_hash
    AND used_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
)
WITH CHECK (
    used_at IS NOT NULL
);


-- ----------------------------------------------------------------------------
-- 13. DISCOUNTS Y USAGES
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS discounts_staff_access ON public.discounts;
CREATE POLICY discounts_staff_access ON public.discounts
FOR ALL
TO authenticated
USING (location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid))
WITH CHECK (location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid));

DROP POLICY IF EXISTS discounts_public_read ON public.discounts;
CREATE POLICY discounts_public_read ON public.discounts
FOR SELECT
TO anon
USING (
    is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
);

DROP POLICY IF EXISTS discount_usages_staff_access ON public.discount_usages;
CREATE POLICY discount_usages_staff_access ON public.discount_usages
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.discounts d
        WHERE d.id = discount_usages.discount_id
          AND d.location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid)
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.discounts d
        WHERE d.id = discount_usages.discount_id
          AND d.location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid)
    )
);


-- ----------------------------------------------------------------------------
-- 14. ALLERGENS Y DIET_LABELS
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS allergens_public_read ON public.allergens;
CREATE POLICY allergens_public_read ON public.allergens
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS diet_labels_public_read ON public.diet_labels;
CREATE POLICY diet_labels_public_read ON public.diet_labels
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS product_allergens_staff_access ON public.product_allergens;
CREATE POLICY product_allergens_staff_access ON public.product_allergens
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id = product_allergens.product_id
          AND p.location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid)
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id = product_allergens.product_id
          AND p.location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid)
    )
);

DROP POLICY IF EXISTS product_allergens_public_read ON public.product_allergens;
CREATE POLICY product_allergens_public_read ON public.product_allergens
FOR SELECT
TO anon
USING (true);

DROP POLICY IF EXISTS product_diet_labels_staff_access ON public.product_diet_labels;
CREATE POLICY product_diet_labels_staff_access ON public.product_diet_labels
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id = product_diet_labels.product_id
          AND p.location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid)
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id = product_diet_labels.product_id
          AND p.location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid)
    )
);

DROP POLICY IF EXISTS product_diet_labels_public_read ON public.product_diet_labels;
CREATE POLICY product_diet_labels_public_read ON public.product_diet_labels
FOR SELECT
TO anon
USING (true);


-- ----------------------------------------------------------------------------
-- 15. AUDIT_LOG
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS audit_log_service_all ON public.audit_log;
DROP POLICY IF EXISTS audit_log_staff_read ON public.audit_log;
CREATE POLICY audit_log_staff_read ON public.audit_log
FOR SELECT
TO authenticated
USING (
    location_id = (SELECT NULLIF(current_setting('app.local_id', true), '')::uuid)
);

DO $$
BEGIN
  RAISE NOTICE 'Políticas RLS optimizadas contra auth_rls_initplan y multiple_permissive_policies con éxito.';
END $$;
