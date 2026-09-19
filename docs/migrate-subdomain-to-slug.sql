-- Migración: locations por PATH (no por subdominio).
-- Renombra locals.subdomain → locals.slug. El valor se conserva: el antiguo
-- "subdominio" pasa a ser la ruta pública de la sucursal ({dominio}/{slug}).
-- Run in Supabase SQL Editor (como postgres, salta RLS) o psql. Idempotente.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'locals'
          AND column_name = 'subdomain'
    ) THEN
        ALTER TABLE locals RENAME COLUMN subdomain TO slug;
        RAISE NOTICE 'Columna renombrada: locals.subdomain -> locals.slug';
    ELSE
        RAISE NOTICE 'Nada que migrar: la columna slug ya existe (o subdomain no existe).';
    END IF;
END
$$;

-- Sugerencia (opcional): ningún cambio de índices es necesario, el UNIQUE viaja con la columna.