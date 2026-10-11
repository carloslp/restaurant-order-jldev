// src/features/staff/LocationSwitcher.tsx
'use client';

import { useState, useTransition, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { setActiveStaffLocation, toggleLocalOpenStatus } from '@/lib/server/locals';
import { useCart } from '@/features/cart/CartContext';
import { MapPin, Loader2, AlertTriangle, X } from 'lucide-react';

export interface LocalItem {
  id: string;
  name: string;
  slug: string;
  is_open?: boolean;
}

export interface LocationSwitcherProps {
  locals: LocalItem[];
  activeLocalId: string;
  currentIsOpen?: boolean;
  onLocationChange?: (local: LocalItem) => void;
  showStatusToggle?: boolean;
  variant?: 'dark' | 'light';
}

export function LocationSwitcher({
  locals,
  activeLocalId,
  currentIsOpen = true,
  onLocationChange,
  showStatusToggle = true,
  variant = 'dark',
}: LocationSwitcherProps) {
  const router = useRouter();
  const { cart, clearCart } = useCart();
  const [isPending, startTransition] = useTransition();
  const [isOpenState, setIsOpenState] = useState(currentIsOpen);
  const [toggling, setToggling] = useState(false);

  // FEATURE F-03: Diálogo modal de confirmación por cambio de sede con carrito activo
  const [pendingTargetId, setPendingTargetId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const currentLocal = locals.find((l) => l.id === activeLocalId);
  const currentName = currentLocal?.name || cart.location_name || 'Norte';
  const targetLocal = locals.find((l) => l.id === pendingTargetId);
  const targetName = targetLocal?.name || 'Sur';

  // CA-2: Cancelación de cambio al presionar la tecla Escape
  useEffect(() => {
    if (!isModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false);
        setPendingTargetId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  const executeChange = useCallback(
    (targetId: string) => {
      const nextLocal = locals.find((l) => l.id === targetId);
      if (!nextLocal) return;

      if (onLocationChange) {
        onLocationChange(nextLocal);
        return;
      }

      startTransition(async () => {
        try {
          await setActiveStaffLocation(targetId);
          router.refresh();
        } catch {
          // Si no es contexto de staff, redirigir a la ruta pública de la sucursal
          router.push(`/${nextLocal.slug}`);
        }
      });
    },
    [locals, onLocationChange, router]
  );

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextId = e.target.value;
    if (!nextId || nextId === activeLocalId) return;

    // CA-1: Si hay 1 o más productos en el carrito, advertir antes de cambiar
    if (cart.items.length > 0) {
      setPendingTargetId(nextId);
      setIsModalOpen(true);
      return;
    }

    executeChange(nextId);
  };

  const handleCancelModal = () => {
    setIsModalOpen(false);
    setPendingTargetId(null);
  };

  const handleConfirmAndClear = () => {
    const targetId = pendingTargetId;
    clearCart();
    setIsModalOpen(false);
    setPendingTargetId(null);

    if (targetId) {
      executeChange(targetId);
    }
  };

  const handleToggleOpen = async () => {
    if (!activeLocalId || toggling) return;
    const nextState = !isOpenState;
    setToggling(true);
    try {
      await toggleLocalOpenStatus(activeLocalId, nextState);
      setIsOpenState(nextState);
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      console.error('Error al alternar estado del local:', err);
    } finally {
      setToggling(false);
    }
  };

  const isLight = variant === 'light';

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Selector de Sucursal */}
      <div className="relative flex items-center">
        <MapPin className="w-3.5 h-3.5 text-orange-500 absolute left-2.5 pointer-events-none" />
        <select
          value={activeLocalId}
          onChange={handleSelectChange}
          disabled={isPending || locals.length === 0}
          className={`appearance-none text-xs font-semibold rounded-xl pl-8 pr-7 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500/30 transition-all cursor-pointer disabled:opacity-50 ${
            isLight
              ? 'bg-white border border-zinc-200 hover:border-zinc-300 text-zinc-900 shadow-xs'
              : 'bg-zinc-900 border border-zinc-700/80 hover:border-zinc-600 text-white'
          }`}
          title="Cambiar sucursal"
          aria-label="Seleccionar sucursal"
        >
          {locals.map((loc) => (
            <option
              key={loc.id}
              value={loc.id}
              className={isLight ? 'bg-white text-zinc-900 py-1' : 'bg-zinc-900 text-white py-1'}
            >
              {loc.name} {loc.is_open === false ? '(Cerrado)' : ''}
            </option>
          ))}
          {locals.length === 0 && <option value="">Sin locales registrados</option>}
        </select>
        <div
          className={`absolute right-2.5 pointer-events-none text-[10px] ${
            isLight ? 'text-zinc-500' : 'text-zinc-400'
          }`}
        >
          {isPending ? <Loader2 className="w-3 h-3 animate-spin text-orange-500" /> : '▼'}
        </div>
      </div>

      {/* Botón Switch de "Abierto para pedidos" (solo en panel operativo si showStatusToggle=true) */}
      {showStatusToggle && activeLocalId && (
        <button
          type="button"
          onClick={handleToggleOpen}
          disabled={toggling}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border select-none active:scale-95 cursor-pointer shadow-xs ${
            isOpenState
              ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40 hover:bg-emerald-900/80'
              : 'bg-rose-950/80 text-rose-400 border-rose-500/40 hover:bg-rose-900/80'
          }`}
          title={
            isOpenState
              ? 'Sucursal abierta para recibir pedidos en línea. Haz clic para pausar pedidos.'
              : 'Sucursal cerrada para pedidos en línea. Haz clic para abrir y permitir pedidos.'
          }
        >
          {toggling ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                isOpenState ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
              }`}
            />
          )}
          <span>{isOpenState ? 'Abierto para pedidos' : 'Cerrado para pedidos'}</span>
        </button>
      )}

      {/* CA-1 & CA-2: Diálogo modal accesible de confirmación por cambio de sede */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCancelModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="location-modal-title"
            aria-describedby="location-modal-description"
            className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-zinc-100 flex flex-col space-y-4 animate-in zoom-in-95 duration-200"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="location-modal-title" className="text-base font-extrabold text-zinc-900">
                    Cambio de sucursal
                  </h3>
                  <span className="text-xs font-semibold text-zinc-500">
                    Atención a los productos de tu pedido
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelModal}
                className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-600 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Cerrar ventana modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p id="location-modal-description" className="text-sm font-medium text-zinc-700 leading-relaxed">
              Tienes productos agregados en {currentName}. Si cambias a {targetName}, tu carrito actual se vaciará. ¿Deseas continuar?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              {/* CA-2: Opción Mantener en [Sede actual] */}
              <button
                type="button"
                onClick={handleCancelModal}
                className="min-h-[44px] px-4 py-2.5 rounded-xl border border-zinc-300 text-sm font-bold text-zinc-700 hover:bg-zinc-100 active:scale-95 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
              >
                Mantener en {currentName}
              </button>

              {/* CA-1: Opción Cambiar y vaciar */}
              <button
                type="button"
                onClick={handleConfirmAndClear}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold shadow-md shadow-orange-600/20 active:scale-95 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
              >
                Cambiar y vaciar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
