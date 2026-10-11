-- ============================================================================
-- MIGRACIÓN: SOPORTE DE MÚLTIPLES MESAS COMBINADAS (GRUPOS GRANDES)
-- Permite al personal de sala (mesero / hostess) unir 2 o más mesas contiguas
-- tanto en la fila de espera como en las reservaciones.
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================================

-- 1. Añadir columna table_ids a reservations y waitlist
ALTER TABLE reservations 
  ADD COLUMN IF NOT EXISTS table_ids UUID[] DEFAULT '{}';

ALTER TABLE waitlist 
  ADD COLUMN IF NOT EXISTS table_ids UUID[] DEFAULT '{}';

-- 2. Índices GIN para consultas rápidas con operadores de arrays (ANY, @>)
CREATE INDEX IF NOT EXISTS idx_reservations_table_ids_gin 
  ON reservations USING GIN (table_ids);

CREATE INDEX IF NOT EXISTS idx_waitlist_table_ids_gin 
  ON waitlist USING GIN (table_ids);

-- 3. Actualizar función RPC get_available_tables para considerar
-- tanto la mesa individual (table_id) como las mesas combinadas (table_ids)
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
      -- Mesas bloqueadas como mesa principal
      SELECT r.table_id
      FROM reservations r
      WHERE r.table_id IS NOT NULL
        AND r.reservation_date = p_date
        AND r.status IN ('PENDIENTE', 'CONFIRMADA')
        AND (
          r.reservation_time < p_end_time 
          AND (r.reservation_time + INTERVAL '90 minutes')::TIME > p_start_time
        )
      UNION
      -- Mesas bloqueadas dentro de un grupo combinado (table_ids)
      SELECT unnest(r.table_ids)
      FROM reservations r
      WHERE r.table_ids IS NOT NULL 
        AND array_length(r.table_ids, 1) > 0
        AND r.reservation_date = p_date
        AND r.status IN ('PENDIENTE', 'CONFIRMADA')
        AND (
          r.reservation_time < p_end_time 
          AND (r.reservation_time + INTERVAL '90 minutes')::TIME > p_start_time
        )
    )
  ORDER BY t.max_capacity ASC, t.table_number ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_available_tables TO anon, authenticated, service_role;
