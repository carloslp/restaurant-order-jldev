-- Migración para añadir columna is_open a locals y notes a orders
-- Ejecutar en el SQL Editor de Supabase

ALTER TABLE locals ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT NULL;

-- Corregir constraint de modifier_groups si existe para permitir max_selections = 0 (sin límite)
DO $$
BEGIN
    ALTER TABLE modifier_groups DROP CONSTRAINT IF EXISTS modifier_groups_check;
    ALTER TABLE modifier_groups DROP CONSTRAINT IF EXISTS modifier_groups_max_selections_check;
    ALTER TABLE modifier_groups ADD CONSTRAINT modifier_groups_max_selections_check 
        CHECK (max_selections = 0 OR max_selections >= min_selections);
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- Sembrar alérgenos estándar NOM-050 si no existen
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

-- Sembrar etiquetas dietarias estándar si no existen
INSERT INTO diet_labels (name, description) VALUES
    ('VEGETARIANO', 'Sin carne'),
    ('VEGANO', 'Sin ingredientes de origen animal'),
    ('SIN_GLUTEN', NULL),
    ('SIN_LACTOSA', NULL),
    ('PICANTE', NULL) ON CONFLICT (name) DO NOTHING;
