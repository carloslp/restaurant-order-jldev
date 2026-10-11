-- Migración para modo catálogo (solo visualización) y control de reservas por sucursal
-- Ejecutar en el SQL Editor de Supabase si se desea persistir a nivel BD

ALTER TABLE locals ADD COLUMN IF NOT EXISTS is_catalog_only BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE locals ADD COLUMN IF NOT EXISTS reservations_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN locals.is_catalog_only IS 'Si es true, el menú de la sucursal es solo informativo/catálogo y no permite armar carritos ni pedidos.';
COMMENT ON COLUMN locals.reservations_enabled IS 'Si es false, las reservas de mesa en línea están pausadas/desactivadas para esta sucursal.';
