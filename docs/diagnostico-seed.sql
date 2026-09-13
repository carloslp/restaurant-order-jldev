-- Diagnóstico visual del estado del seed by remote — imprime SOLO conteos y nombres (sin secretos).
-- Se conecta con rol postgres (dueño) por CLI para no depender de GUCs de app.

SELECT
    (SELECT count(*) FROM locals)            AS locals,
    (SELECT count(*) FROM categories)        AS categories,
    (SELECT count(*) FROM products)          AS products,
    (SELECT count(*) FROM modifier_groups)   AS modifier_groups,
    (SELECT count(*) FROM modifier_options)  AS modifier_options,
    (SELECT count(*) FROM allergen_options)  AS allergen_options,
    (SELECT count(*) FROM diet_label_options) AS diet_label_options,
    (SELECT count(*) FROM allergen_catalog_options) AS allergen_catalog_options,
    (SELECT count(*) FROM modifier_groups_products) AS modifier_groups_products;

SELECT id, name, subdomain FROM locals;
SELECT name, base_price, is_available FROM products ORDER BY name;