-- Seed de datos demo para restaurant-order-jldev
-- Requiere: schema.sql ya aplicado.
-- Corre en SQL Editor de Supabase (como postgres, salta RLS).
-- Crea: 1 local demo (slug 'demo' → ruta /demo), staff, catálogo, alérgenos, aforo.

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
    -- ── Local demo (ruta pública: /demo) ─────────────────────────────────
    INSERT INTO locals (name, slug, timezone, iva_rate, delivery_fee)
    VALUES ('Restaurante Demo JLDev', 'demo', 'America/Mexico_City', 0.16, 30.00)
    RETURNING id INTO v_local;

    -- ── Staff ────────────────────────────────────────────────────────────
    INSERT INTO staff (location_id, email, full_name)
    VALUES
        (v_local, 'admin@demo.com',   'Admin Demo'),
        (v_local, 'cajero@demo.com',  'Cajero Demo'),
        (v_local, 'cocina@demo.com',  'Cocina Demo');

    SELECT id INTO v_admin FROM staff WHERE email = 'admin@demo.com' AND location_id = v_local;
    SELECT id INTO v_cajero FROM staff WHERE email = 'cajero@demo.com' AND location_id = v_local;
    SELECT id INTO v_cocinero FROM staff WHERE email = 'cocina@demo.com' AND location_id = v_local;

    -- ── Alérgenos (NOM-050 lista estándar) ──────────────────────────────
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

    -- ── Etiquetas dietarias ─────────────────────────────────────────────
    INSERT INTO diet_labels (name, description) VALUES
        ('VEGETARIANO', 'Sin carne'),
        ('VEGANO', 'Sin ingredientes de origen animal'),
        ('SIN_GLUTEN', NULL),
        ('SIN_LACTOSA', NULL),
        ('PICANTE', NULL) ON CONFLICT (name) DO NOTHING;

    -- ── Categorías ──────────────────────────────────────────────────────
    INSERT INTO categories (location_id, name, description, sort_order) VALUES
        (v_local, 'Hamburguesas', 'Nuestras clásicas', 1),
        (v_local, 'Acompañamientos', 'Papas, aros y más', 2),
        (v_local, 'Bebidas', 'Refrescos, agua, cerveza', 3),
        (v_local, 'Postres', 'Para terminar bien', 4);

    SELECT id INTO v_cat_hamburguesas FROM categories WHERE name = 'Hamburguesas' AND location_id = v_local;
    SELECT id INTO v_cat_acompanamientos FROM categories WHERE name = 'Acompañamientos' AND location_id = v_local;
    SELECT id INTO v_cat_bebidas FROM categories WHERE name = 'Bebidas' AND location_id = v_local;
    SELECT id INTO v_cat_postres FROM categories WHERE name = 'Postres' AND location_id = v_local;

    -- ── Productos (precios públicos con IVA incluido) ───────────────────
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

    -- ── Grupos de modificadores (hamburguesas) ─────────────────────────
    -- Término de la carne: obligatorio, 1 selección
    INSERT INTO modifier_groups (location_id, product_id, name, is_required, min_selections, max_selections)
    VALUES
        (v_local, v_prod_clasica, 'Término de la carne', TRUE, 1, 1),
        (v_local, v_prod_doble,  'Término de la carne', TRUE, 1, 1),
        (v_local, v_prod_veggie, 'Término de la carne', TRUE, 1, 1);

    -- Extras: opcional, hasta 3
    INSERT INTO modifier_groups (location_id, product_id, name, is_required, min_selections, max_selections)
    VALUES
        (v_local, v_prod_clasica, 'Extras', FALSE, 0, 3),
        (v_local, v_prod_doble,  'Extras', FALSE, 0, 3),
        (v_local, v_prod_veggie, 'Extras', FALSE, 0, 3);

    -- Salsas: opcional, hasta 2
    INSERT INTO modifier_groups (location_id, product_id, name, is_required, min_selections, max_selections)
    VALUES
        (v_local, v_prod_clasica, 'Salsas', FALSE, 0, 2),
        (v_local, v_prod_doble,  'Salsas', FALSE, 0, 2),
        (v_local, v_prod_veggie, 'Salsas', FALSE, 0, 2);

    -- Opciones (solo para el grupo de la Clásica; los demás comparten por product_id
    -- pero las opciones van por modifier_group_id → hay que crearlas por cada grupo)
    -- Término (3 opciones +0)
    FOR v_grp_termino IN SELECT id FROM modifier_groups WHERE name = 'Término de la carne' AND location_id = v_local LOOP
        INSERT INTO modifier_options (location_id, modifier_group_id, name, price_impact) VALUES
            (v_local, v_grp_termino, 'Término medio', 0),
            (v_local, v_grp_termino, '3/4', 0),
            (v_local, v_grp_termino, 'Bien cocida', 0);
    END LOOP;

    -- Extras
    FOR v_grp_extras IN SELECT id FROM modifier_groups WHERE name = 'Extras' AND location_id = v_local LOOP
        INSERT INTO modifier_options (location_id, modifier_group_id, name, price_impact) VALUES
            (v_local, v_grp_extras, 'Queso extra', 15),
            (v_local, v_grp_extras, 'Tocino', 20),
            (v_local, v_grp_extras, 'Huevo', 10),
            (v_local, v_grp_extras, 'Guacamole', 25);
    END LOOP;

    -- Salsas
    FOR v_grp_salsas IN SELECT id FROM modifier_groups WHERE name = 'Salsas' AND location_id = v_local LOOP
        INSERT INTO modifier_options (location_id, modifier_group_id, name, price_impact) VALUES
            (v_local, v_grp_salsas, 'BBQ', 5),
            (v_local, v_grp_salsas, 'Chipotle', 5),
            (v_local, v_grp_salsas, 'Mostaza miel', 5);
    END LOOP;

    -- ── Relación alérgenos / etiquetas (ejemplos) ─────────────────────
    INSERT INTO product_allergens (product_id, allergen_id)
    SELECT v_prod_clasica, id FROM allergens WHERE name IN ('GLUTEN', 'LACTEOS') ON CONFLICT DO NOTHING;
    INSERT INTO product_allergens (product_id, allergen_id)
    SELECT v_prod_veggie, id FROM allergens WHERE name = 'GLUTEN' ON CONFLICT DO NOTHING;
    INSERT INTO product_allergens (product_id, allergen_id)
    SELECT v_prod_brownie, id FROM allergens WHERE name IN ('GLUTEN', 'LACTEOS', 'FRUTOS_SECOS') ON CONFLICT DO NOTHING;
    INSERT INTO product_allergens (product_id, allergen_id)
    SELECT v_prod_cheesecake, id FROM allergens WHERE name = 'LACTEOS' ON CONFLICT DO NOTHING;

    INSERT INTO product_diet_labels (product_id, diet_label_id)
    SELECT v_prod_veggie, id FROM diet_labels WHERE name IN ('VEGETARIANO', 'VEGANO') ON CONFLICT DO NOTHING;
    INSERT INTO product_diet_labels (product_id, diet_label_id)
    SELECT v_prod_cheesecake, id FROM diet_labels WHERE name = 'VEGETARIANO' ON CONFLICT DO NOTHING;

    -- ── Aforo por zona ─────────────────────────────────────────────────
    INSERT INTO local_zone_capacity (location_id, zone, capacity) VALUES
        (v_local, 'INTERIOR', 30),
        (v_local, 'TERRAZA', 20),
        (v_local, 'BARRA', 8);

    RAISE NOTICE 'Seed listo. Local demo: % (ruta /demo)', v_local;
END $$;