-- ============================================================================
-- Seed de datos demo para restaurant-order-jldev
-- ============================================================================
-- Requiere: docs/install.sql ya aplicado.
-- Corre en el SQL Editor de Supabase (como rol postgres, salta RLS).
-- Crea: 1 local demo (slug 'demo' -> ruta /{slug} -> /demo), staff, mesas físicas
--       con aforo dinámico, turnos base, catálogo (4 categorías, 10 productos,
--       modificadores), alérgenos NOM-050 y etiquetas dietarias.
-- ============================================================================

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
    -- ── 1. Local demo (ruta pública: /demo) ─────────────────────────────────
    INSERT INTO public.locals (
        name,
        slug,
        timezone,
        iva_rate,
        delivery_fee,
        is_open,
        is_catalog_only,
        reservations_enabled,
        address,
        latitude,
        longitude
    )
    VALUES (
        'Restaurante Demo JLDev',
        'demo',
        'America/Mexico_City',
        0.16,
        30.00,
        true,
        false,
        true,
        'Av. Juárez 70, Centro, Cuauhtémoc, 06010 Ciudad de México, CDMX',
        19.432608,
        -99.143612
    )
    ON CONFLICT (slug) DO UPDATE
        SET name = EXCLUDED.name,
            address = EXCLUDED.address,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude
    RETURNING id INTO v_local;

    IF v_local IS NULL THEN
        SELECT id INTO v_local FROM public.locals WHERE slug = 'demo';
    END IF;

    -- ── 2. Staff ────────────────────────────────────────────────────────────
    INSERT INTO public.staff (location_id, email, full_name, is_active)
    VALUES
        (v_local, 'admin@demo.com',   'Admin Demo',   true),
        (v_local, 'cajero@demo.com',  'Cajero Demo',  true),
        (v_local, 'cocina@demo.com',  'Cocina Demo',  true)
    ON CONFLICT (email) DO UPDATE
        SET location_id = EXCLUDED.location_id,
            full_name = EXCLUDED.full_name,
            is_active = true;

    SELECT id INTO v_admin FROM public.staff WHERE email = 'admin@demo.com' AND location_id = v_local;
    SELECT id INTO v_cajero FROM public.staff WHERE email = 'cajero@demo.com' AND location_id = v_local;
    SELECT id INTO v_cocinero FROM public.staff WHERE email = 'cocina@demo.com' AND location_id = v_local;

    -- ── 3. Mesas Físicas (Aforo dinámico por zona) ──────────────────────────
    -- INTERIOR: 5 mesas (capacidad total 30)
    -- TERRAZA: 4 mesas (capacidad total 20)
    -- BARRA: 4 sillas/lugares (capacidad total 8)
    INSERT INTO public.restaurant_tables (location_id, zone, table_number, min_capacity, max_capacity, is_active)
    VALUES
        -- Interior
        (v_local, 'INTERIOR', 'M1', 2, 4, true),
        (v_local, 'INTERIOR', 'M2', 2, 4, true),
        (v_local, 'INTERIOR', 'M3', 4, 6, true),
        (v_local, 'INTERIOR', 'M4', 4, 8, true),
        (v_local, 'INTERIOR', 'M5', 4, 8, true),
        -- Terraza
        (v_local, 'TERRAZA', 'T1', 2, 4, true),
        (v_local, 'TERRAZA', 'T2', 2, 4, true),
        (v_local, 'TERRAZA', 'T3', 4, 6, true),
        (v_local, 'TERRAZA', 'T4', 4, 6, true),
        -- Barra
        (v_local, 'BARRA', 'B1', 1, 2, true),
        (v_local, 'BARRA', 'B2', 1, 2, true),
        (v_local, 'BARRA', 'B3', 1, 2, true),
        (v_local, 'BARRA', 'B4', 1, 2, true)
    ON CONFLICT (location_id, table_number) DO UPDATE
        SET min_capacity = EXCLUDED.min_capacity,
            max_capacity = EXCLUDED.max_capacity,
            zone = EXCLUDED.zone,
            is_active = true;

    -- ── 4. Turnos Operativos por Defecto (Lunes a Domingo) ───────────────────
    FOR day_idx IN 0..6 LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.local_shifts 
            WHERE location_id = v_local AND day_of_week = day_idx AND shift_name = 'Comida y Cena'
        ) THEN
            INSERT INTO public.local_shifts (
                location_id, day_of_week, shift_name, open_time, close_time,
                slot_interval_minutes, turn_duration_minutes, buffer_minutes, is_active
            ) VALUES (
                v_local, day_idx, 'Comida y Cena', '12:00:00', '23:00:00',
                30, 90, 15, true
            );
        END IF;
    END LOOP;

    -- ── 5. Alérgenos (NOM-050) y Etiquetas Dietarias ─────────────────────────
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

    -- ── 6. Categorías ────────────────────────────────────────────────────────
    INSERT INTO public.categories (location_id, name, description, sort_order, is_active) VALUES
        (v_local, 'Hamburguesas', 'Nuestras clásicas', 1, true),
        (v_local, 'Acompañamientos', 'Papas, aros y más', 2, true),
        (v_local, 'Bebidas', 'Refrescos, agua, cerveza', 3, true),
        (v_local, 'Postres', 'Para terminar bien', 4, true)
    ON CONFLICT (location_id, name) DO UPDATE
        SET description = EXCLUDED.description,
            sort_order = EXCLUDED.sort_order,
            is_active = true;

    SELECT id INTO v_cat_hamburguesas FROM public.categories WHERE name = 'Hamburguesas' AND location_id = v_local;
    SELECT id INTO v_cat_acompanamientos FROM public.categories WHERE name = 'Acompañamientos' AND location_id = v_local;
    SELECT id INTO v_cat_bebidas FROM public.categories WHERE name = 'Bebidas' AND location_id = v_local;
    SELECT id INTO v_cat_postres FROM public.categories WHERE name = 'Postres' AND location_id = v_local;

    -- ── 7. Productos (precios públicos con IVA incluido) ────────────────────
    INSERT INTO public.products (location_id, category_id, name, description, base_price, is_available) VALUES
        (v_local, v_cat_hamburguesas, 'Clásica', 'Carne 100% res, queso americano, lechuga, jitomate, cebolla y nuestra salsa', 95.00, true),
        (v_local, v_cat_hamburguesas, 'Doble', 'Dos carnes, doble queso, tocino y salsa especial', 130.00, true),
        (v_local, v_cat_hamburguesas, 'Veggie', 'Patty de garbanzo, aguacate, espinaca y mayonesa vegana', 110.00, true),
        (v_local, v_cat_acompanamientos, 'Papas a la francesa', 'Crujientes, con sal de mar', 45.00, true),
        (v_local, v_cat_acompanamientos, 'Aros de cebolla', 'Rebozados y dorados', 50.00, true),
        (v_local, v_cat_bebidas, 'Refresco de cola', 'Lata 355ml', 35.00, true),
        (v_local, v_cat_bebidas, 'Agua mineral', 'Botella 600ml', 25.00, true),
        (v_local, v_cat_bebidas, 'Cerveza artesanal', 'Pinta 473ml', 60.00, true),
        (v_local, v_cat_postres, 'Brownie con nuez', 'Con helado de vainilla', 40.00, true),
        (v_local, v_cat_postres, 'Cheesecake', 'Con frutos rojos', 55.00, true)
    ON CONFLICT (location_id, name) DO UPDATE
        SET description = EXCLUDED.description,
            base_price = EXCLUDED.base_price,
            is_available = true;

    SELECT id INTO v_prod_clasica FROM public.products WHERE name = 'Clásica' AND location_id = v_local;
    SELECT id INTO v_prod_doble FROM public.products WHERE name = 'Doble' AND location_id = v_local;
    SELECT id INTO v_prod_veggie FROM public.products WHERE name = 'Veggie' AND location_id = v_local;
    SELECT id INTO v_prod_papas FROM public.products WHERE name = 'Papas a la francesa' AND location_id = v_local;
    SELECT id INTO v_prod_aros FROM public.products WHERE name = 'Aros de cebolla' AND location_id = v_local;
    SELECT id INTO v_prod_refresco FROM public.products WHERE name = 'Refresco de cola' AND location_id = v_local;
    SELECT id INTO v_prod_agua FROM public.products WHERE name = 'Agua mineral' AND location_id = v_local;
    SELECT id INTO v_prod_cerveza FROM public.products WHERE name = 'Cerveza artesanal' AND location_id = v_local;
    SELECT id INTO v_prod_brownie FROM public.products WHERE name = 'Brownie con nuez' AND location_id = v_local;
    SELECT id INTO v_prod_cheesecake FROM public.products WHERE name = 'Cheesecake' AND location_id = v_local;

    -- ── 8. Grupos de Modificadores (hamburguesas) ────────────────────────────
    -- Término de la carne: obligatorio, 1 selección
    INSERT INTO public.modifier_groups (location_id, product_id, name, is_required, min_selections, max_selections)
    VALUES
        (v_local, v_prod_clasica, 'Término de la carne', TRUE, 1, 1),
        (v_local, v_prod_doble,  'Término de la carne', TRUE, 1, 1),
        (v_local, v_prod_veggie, 'Término de la carne', TRUE, 1, 1)
    ON CONFLICT (location_id, product_id, name) DO NOTHING;

    -- Extras: opcional, hasta 3
    INSERT INTO public.modifier_groups (location_id, product_id, name, is_required, min_selections, max_selections)
    VALUES
        (v_local, v_prod_clasica, 'Extras', FALSE, 0, 3),
        (v_local, v_prod_doble,  'Extras', FALSE, 0, 3),
        (v_local, v_prod_veggie, 'Extras', FALSE, 0, 3)
    ON CONFLICT (location_id, product_id, name) DO NOTHING;

    -- Salsas: opcional, hasta 2
    INSERT INTO public.modifier_groups (location_id, product_id, name, is_required, min_selections, max_selections)
    VALUES
        (v_local, v_prod_clasica, 'Salsas', FALSE, 0, 2),
        (v_local, v_prod_doble,  'Salsas', FALSE, 0, 2),
        (v_local, v_prod_veggie, 'Salsas', FALSE, 0, 2)
    ON CONFLICT (location_id, product_id, name) DO NOTHING;

    -- ── 9. Opciones de Modificadores ─────────────────────────────────────────
    -- Término
    FOR v_grp_termino IN SELECT id FROM public.modifier_groups WHERE name = 'Término de la carne' AND location_id = v_local LOOP
        INSERT INTO public.modifier_options (location_id, modifier_group_id, name, price_impact, is_active) VALUES
            (v_local, v_grp_termino, 'Término medio', 0, true),
            (v_local, v_grp_termino, '3/4', 0, true),
            (v_local, v_grp_termino, 'Bien cocida', 0, true)
        ON CONFLICT (location_id, modifier_group_id, name) DO NOTHING;
    END LOOP;

    -- Extras
    FOR v_grp_extras IN SELECT id FROM public.modifier_groups WHERE name = 'Extras' AND location_id = v_local LOOP
        INSERT INTO public.modifier_options (location_id, modifier_group_id, name, price_impact, is_active) VALUES
            (v_local, v_grp_extras, 'Queso extra', 15, true),
            (v_local, v_grp_extras, 'Tocino', 20, true),
            (v_local, v_grp_extras, 'Huevo', 10, true),
            (v_local, v_grp_extras, 'Guacamole', 25, true)
        ON CONFLICT (location_id, modifier_group_id, name) DO NOTHING;
    END LOOP;

    -- Salsas
    FOR v_grp_salsas IN SELECT id FROM public.modifier_groups WHERE name = 'Salsas' AND location_id = v_local LOOP
        INSERT INTO public.modifier_options (location_id, modifier_group_id, name, price_impact, is_active) VALUES
            (v_local, v_grp_salsas, 'BBQ', 5, true),
            (v_local, v_grp_salsas, 'Chipotle', 5, true),
            (v_local, v_grp_salsas, 'Mostaza miel', 5, true)
        ON CONFLICT (location_id, modifier_group_id, name) DO NOTHING;
    END LOOP;

    -- ── 10. Relación Alérgenos y Dietas ──────────────────────────────────────
    INSERT INTO public.product_allergens (product_id, allergen_id)
    SELECT v_prod_clasica, id FROM public.allergens WHERE name IN ('GLUTEN', 'LACTEOS') ON CONFLICT DO NOTHING;
    INSERT INTO public.product_allergens (product_id, allergen_id)
    SELECT v_prod_veggie, id FROM public.allergens WHERE name = 'GLUTEN' ON CONFLICT DO NOTHING;
    INSERT INTO public.product_allergens (product_id, allergen_id)
    SELECT v_prod_brownie, id FROM public.allergens WHERE name IN ('GLUTEN', 'LACTEOS', 'FRUTOS_SECOS') ON CONFLICT DO NOTHING;
    INSERT INTO public.product_allergens (product_id, allergen_id)
    SELECT v_prod_cheesecake, id FROM public.allergens WHERE name = 'LACTEOS' ON CONFLICT DO NOTHING;

    INSERT INTO public.product_diet_labels (product_id, diet_label_id)
    SELECT v_prod_veggie, id FROM public.diet_labels WHERE name IN ('VEGETARIANO', 'VEGANO') ON CONFLICT DO NOTHING;
    INSERT INTO public.product_diet_labels (product_id, diet_label_id)
    SELECT v_prod_cheesecake, id FROM public.diet_labels WHERE name = 'VEGETARIANO' ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Seed listo. Local demo configurado: % (ruta /{slug} -> /demo)', v_local;
END $$;