'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { listProducts, toggleProductAvailability } from '@/lib/server/menu';
import type { Product } from '@/lib/types';
import { 
  X, 
  Search, 
  Loader2, 
  CheckCircle2, 
  Ban, 
  AlertCircle, 
  UtensilsCrossed,
  RefreshCw
} from 'lucide-react';
import { formatMXN } from '@/lib/pricing';

interface ProductAvailabilityManagerProps {
  locationId: string;
  isOpen: boolean;
  onClose: () => void;
  onProductChanged?: (product: Product) => void;
}

export function ProductAvailabilityManager({
  locationId,
  isOpen,
  onClose,
  onProductChanged,
}: ProductAvailabilityManagerProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'OUT_OF_STOCK'>('ALL');
  const [, startTransition] = useTransition();

  const loadAllProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listProducts();
      setProducts(data);
    } catch (err) {
      console.error('loadAllProducts error:', err);
      setError('No se pudo cargar la lista de productos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadAllProducts();
    }
  }, [isOpen, loadAllProducts]);

  // Bloquear scroll cuando el modal está abierto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleToggle = async (product: Product) => {
    if (pendingProductId) return;
    const nextAvailability = !product.is_available;
    const previousProducts = [...products];

    // Optimistic update
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, is_available: nextAvailability } : p))
    );
    setPendingProductId(product.id);
    setError(null);

    try {
      const res = await toggleProductAvailability(product.id, nextAvailability);
      if (!res.ok) {
        // Revert optimistically on failure (CA-5)
        setProducts(previousProducts);
        setError(res.error || 'No se pudo actualizar el estado del platillo');
      } else if (res.product) {
        onProductChanged?.(res.product);
      }
    } catch {
      // Revert on network/auth failure (CA-5)
      setProducts(previousProducts);
      setError('No se pudo actualizar el estado del platillo');
    } finally {
      setPendingProductId(null);
    }
  };

  const filtered = products.filter((p) => {
    const matchesSearch =
      !search.trim() ||
      p.name.toLowerCase().includes(search.toLowerCase().trim()) ||
      (p.description && p.description.toLowerCase().includes(search.toLowerCase().trim()));

    if (!matchesSearch) return false;
    if (filter === 'ACTIVE') return p.is_available;
    if (filter === 'OUT_OF_STOCK') return !p.is_available;
    return true;
  });

  const outOfStockCount = products.filter((p) => !p.is_available).length;

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="availability-modal-title"
    >
      <div 
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-zinc-200 animate-in zoom-in-95 duration-200"
      >
        {/* Cabecera */}
        <div className="p-4 sm:p-5 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div>
              <h2 id="availability-modal-title" className="text-lg font-bold text-zinc-900 tracking-tight">
                Disponibilidad Rápida ("86")
              </h2>
              <p className="text-xs text-zinc-500 font-medium">
                Marca platillos agotados o reactívalos con un toque en tiempo real.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
            aria-label="Cerrar panel de disponibilidad"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de búsqueda y filtros */}
        <div className="p-4 border-b border-zinc-100 space-y-3 bg-white">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar platillo por nombre..."
              className="w-full pl-9 pr-9 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  filter === 'ALL'
                    ? 'bg-zinc-900 text-white shadow-xs'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                Todos ({products.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter('OUT_OF_STOCK')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  filter === 'OUT_OF_STOCK'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-red-50 text-red-700 hover:bg-red-100'
                }`}
              >
                <Ban className="w-3.5 h-3.5" />
                <span>Agotados (86)</span>
                {outOfStockCount > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    filter === 'OUT_OF_STOCK' ? 'bg-red-800 text-white' : 'bg-red-200 text-red-900'
                  }`}>
                    {outOfStockCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setFilter('ACTIVE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  filter === 'ACTIVE'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                Disponibles ({products.length - outOfStockCount})
              </button>
            </div>

            <button
              type="button"
              onClick={loadAllProducts}
              disabled={loading}
              className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800 px-2 py-1 rounded-md hover:bg-zinc-100"
              title="Recargar lista"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Actualizar</span>
            </button>
          </div>
        </div>

        {/* Feedback de error accesible (CA-5) */}
        {error && (
          <div 
            role="alert" 
            aria-live="assertive"
            className="m-4 mb-0 rounded-xl bg-red-50 border border-red-200 p-3 text-xs sm:text-sm font-semibold text-red-700 flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Lista de platillos */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 divide-y divide-zinc-100">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-zinc-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-orange-600" />
              <span className="text-xs font-medium">Cargando catálogo...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-zinc-400 text-xs">
              No se encontraron platillos con el filtro actual.
            </div>
          ) : (
            filtered.map((product) => {
              const isPending = pendingProductId === product.id;
              const isAvailable = product.is_available;

              return (
                <div
                  key={product.id}
                  className={`pt-2.5 first:pt-0 flex items-center justify-between gap-3 p-2.5 rounded-xl transition-colors ${
                    !isAvailable ? 'bg-red-50/50 border border-red-100' : 'hover:bg-zinc-50'
                  }`}
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold text-sm truncate ${
                        !isAvailable ? 'text-zinc-700 line-through opacity-80' : 'text-zinc-900'
                      }`}>
                        {product.name}
                      </span>
                      {!isAvailable ? (
                        <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-100 text-red-800 text-[10px] font-black uppercase tracking-wider">
                          <Ban className="w-3 h-3" />
                          Agotado (86)
                        </span>
                      ) : (
                        <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
                          Disponible
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-mono font-semibold text-zinc-500">
                        {formatMXN(product.base_price)}
                      </span>
                      {product.description && (
                        <span className="text-[11px] text-zinc-400 truncate max-w-xs">
                          · {product.description}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* CA-8: Área táctil mínima de 44x44 px */}
                  <button
                    type="button"
                    onClick={() => handleToggle(product)}
                    disabled={isPending}
                    aria-label={
                      isAvailable
                        ? `Marcar ${product.name} como agotado (86)`
                        : `Reactivar disponibilidad de ${product.name}`
                    }
                    className={`min-w-[140px] min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer select-none touch-manipulation active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                      isPending
                        ? 'opacity-60 cursor-not-allowed bg-zinc-200 text-zinc-600'
                        : isAvailable
                          ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-600 hover:text-white'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs'
                    }`}
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Guardando...</span>
                      </>
                    ) : isAvailable ? (
                      <>
                        <Ban className="w-4 h-4" />
                        <span>Marcar 86 (Agotado)</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Reactivar</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-200 bg-zinc-50 flex items-center justify-between text-xs text-zinc-500">
          <span>{products.length} platillos en menú</span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-zinc-900 text-white font-bold hover:bg-zinc-800 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
          >
            Listo / Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
