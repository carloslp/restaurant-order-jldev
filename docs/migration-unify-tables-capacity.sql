-- ============================================================================
-- MIGRACIÓN: UNIFICACIÓN DE AFORO Y RESERVAS BASADO EN MESAS FÍSICAS DISCRETAS
-- Elimina la dualidad entre aforo escalar manual y mesas físicas reales.
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================================

-- 1. Asegurar relación directa e índices de búsqueda rápida
ALTER TABLE reservations 
  ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES restaurant_tables(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_table_date_status 
  ON reservations (table_id, reservation_date, status);

CREATE INDEX IF NOT EXISTS idx_restaurant_tables_location_zone_active
  ON restaurant_tables (location_id, zone, is_active);

-- 2. Sustituir tabla manual local_zone_capacity por una VISTA calculada en tiempo real.
-- Bloque seguro: detecta si es tabla ordinaria ('r') o vista ('v') antes de eliminarla,
-- evitando el error 42809 de PostgreSQL.
DO $$
DECLARE
  v_relkind "char";
BEGIN
  -- Eliminar local_zone_capacity de forma segura
  SELECT c.relkind INTO v_relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'local_zone_capacity'
    AND n.nspname = current_schema();

  IF v_relkind = 'r' THEN
    EXECUTE 'DROP TABLE local_zone_capacity CASCADE';
  ELSIF v_relkind = 'v' THEN
    EXECUTE 'DROP VIEW local_zone_capacity CASCADE';
  END IF;

  -- Eliminar zone_capacities si existiera
  SELECT c.relkind INTO v_relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'zone_capacities'
    AND n.nspname = current_schema();

  IF v_relkind = 'r' THEN
    EXECUTE 'DROP TABLE zone_capacities CASCADE';
  ELSIF v_relkind = 'v' THEN
    EXECUTE 'DROP VIEW zone_capacities CASCADE';
  END IF;
END $$;

CREATE OR REPLACE VIEW local_zone_capacity
WITH (security_invoker = true) AS
SELECT 
  location_id,
  zone,
  COALESCE(SUM(max_capacity), 0)::INTEGER AS capacity
FROM restaurant_tables
WHERE is_active = TRUE
GROUP BY location_id, zone;

-- Permisos de lectura para la vista de aforo calculado
GRANT SELECT ON local_zone_capacity TO anon, authenticated, service_role;

-- 3. Función RPC para obtener mesas disponibles para una fecha, franja y tamaño de grupo
-- Prioriza la asignación "Best-Fit" (mesa más ajustada en capacidad) para no desperdiciar mesas grandes.
CREATE OR REPLACE FUNCTION get_available_tables(
  p_location_id UUID,
  p_date DATE,
  p_start_time TIME,
  p_end_time TIME,
  p_party_size INT,
  p_zone TEXT DEFAULT NULL
)
RETURNS TABLE (
  table_id UUID,
  table_number TEXT,
  min_capacity INT,
  max_capacity INT,
  zone TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id AS table_id,
    t.table_number,
    t.min_capacity,
    t.max_capacity,
    t.zone
  FROM restaurant_tables t
  WHERE t.location_id = p_location_id
    AND t.is_active = TRUE
    AND (p_zone IS NULL OR t.zone = p_zone)
    AND p_party_size BETWEEN t.min_capacity AND t.max_capacity
    AND t.id NOT IN (
      SELECT r.table_id
      FROM reservations r
      WHERE r.table_id IS NOT NULL
        AND r.reservation_date = p_date
        AND r.status IN ('PENDIENTE', 'CONFIRMADA')
        AND (
          -- Solapamiento de horario de reserva
          r.reservation_time < p_end_time 
          AND (r.reservation_time + INTERVAL '90 minutes')::TIME > p_start_time
        )
    )
  ORDER BY t.max_capacity ASC, t.table_number ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_available_tables TO anon, authenticated, service_role;

COMMENT ON FUNCTION get_available_tables IS 'Retorna mesas físicas activas sin reservas solapadas que admiten el tamaño del grupo solicitado.';
