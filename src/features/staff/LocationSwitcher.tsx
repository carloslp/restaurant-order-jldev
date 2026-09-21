// src/features/staff/LocationSwitcher.tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setActiveStaffLocation, toggleLocalOpenStatus } from '@/lib/server/locals';
import { MapPin, Power, Loader2, Check } from 'lucide-react';

interface LocalItem {
  id: string;
  name: string;
  slug: string;
  is_open?: boolean;
}

interface Props {
  locals: LocalItem[];
  activeLocalId: string;
  currentIsOpen?: boolean;
}

export function LocationSwitcher({ locals, activeLocalId, currentIsOpen = true }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpenState, setIsOpenState] = useState(currentIsOpen);
  const [toggling, setToggling] = useState(false);

  const handleSelectChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextId = e.target.value;
    if (!nextId || nextId === activeLocalId) return;

    startTransition(async () => {
      await setActiveStaffLocation(nextId);
      router.refresh();
    });
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

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Selector de Sucursal */}
      <div className="relative flex items-center">
        <MapPin className="w-3.5 h-3.5 text-orange-500 absolute left-2.5 pointer-events-none" />
        <select
          value={activeLocalId}
          onChange={handleSelectChange}
          disabled={isPending || locals.length === 0}
          className="appearance-none bg-zinc-900 border border-zinc-700/80 hover:border-zinc-600 text-white text-xs font-semibold rounded-xl pl-8 pr-7 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500/30 transition-all cursor-pointer disabled:opacity-50"
          title="Cambiar sucursal activa en el panel"
        >
          {locals.map((loc) => (
            <option key={loc.id} value={loc.id} className="bg-zinc-900 text-white py-1">
              {loc.name} {loc.is_open === false ? '(Cerrado)' : ''}
            </option>
          ))}
          {locals.length === 0 && (
            <option value="">Sin locales registrados</option>
          )}
        </select>
        <div className="absolute right-2.5 pointer-events-none text-zinc-400 text-[10px]">
          {isPending ? <Loader2 className="w-3 h-3 animate-spin text-orange-500" /> : '▼'}
        </div>
      </div>

      {/* Botón Switch de "Abierto para pedidos" */}
      {activeLocalId && (
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
    </div>
  );
}
