-- ============================================================================
-- docs/fix-orders-constraints.sql
-- Elimina los CHECK constraints obsoletos e incompatibles de la tabla orders:
--   1) chk_eta_future: (eta > now())
--      Causaba que pedidos con retraso o en preparación no pudieran cambiar de estado
--      ni cobrarse, arrojando error 23514 ("Los datos no cumplen las reglas del sistema").
--   2) chk_total_consistency: ABS(total - (subtotal + delivery_fee_amount)) < 0.01
--      Causaba que pedidos con descuentos manuales o promociones no pudieran ser
--      cobrados ni actualizados en caja.
--
-- Ejecutar en: Supabase Dashboard -> SQL Editor (en el proyecto zxzztclmmobsgabaarns).
-- Es idempotente: DROP CONSTRAINT IF EXISTS no falla si ya fueron removidos.
-- ============================================================================

-- 1. Eliminar constraint de ETA a futuro en orders
ALTER TABLE public.orders 
  DROP CONSTRAINT IF EXISTS chk_eta_future;

-- 2. Eliminar constraint rígido de total en orders
ALTER TABLE public.orders 
  DROP CONSTRAINT IF EXISTS chk_total_consistency;

-- Mensaje de confirmación
DO $$
BEGIN
  RAISE NOTICE 'Constraints chk_eta_future y chk_total_consistency removidos con éxito de public.orders';
END $$;
