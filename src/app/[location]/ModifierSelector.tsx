'use client';

import { useState, useMemo } from 'react';
import type { Product, ModifierGroup, CartItemModifiers } from '@/lib/types';
import { formatMXN } from '@/lib/pricing';
import { X, Check } from 'lucide-react';

interface Props {
  product: Product;
  onConfirm: (modifiers: CartItemModifiers[]) => void;
  onCancel: () => void;
}

export default function ModifierSelector({ product, onConfirm, onCancel }: Props) {
  const groups = product.modifier_groups || [];

  // State: modifier_group_id -> set of option_ids
  const [selections, setSelections] = useState<Record<string, Set<string>>>({});

  const toggleOption = (groupId: string, optionId: string, group: ModifierGroup) => {
    setSelections((prev) => {
      const next = { ...prev };
      const current = new Set(next[groupId] || []);

      if (current.has(optionId)) {
        current.delete(optionId);
      } else {
        // Si max_selections es 1 (como un radio group), sustituir la selección previa
        if (group.max_selections === 1) {
          current.clear();
          current.add(optionId);
        } else if (group.max_selections > 1 && current.size >= group.max_selections) {
          return prev; // Máximo alcanzado
        } else {
          current.add(optionId);
        }
      }

      next[groupId] = current;
      return next;
    });
  };

  const isValid = useMemo(() => {
    return groups.every((group) => {
      const selected = selections[group.id] || new Set();
      if (group.is_required && selected.size === 0) return false;
      if (selected.size < group.min_selections) return false;
      return true;
    });
  }, [groups, selections]);

  const totalPrice = useMemo(() => {
    let extra = 0;
    groups.forEach((group) => {
      const selectedIds = selections[group.id] || new Set();
      group.options.forEach((opt) => {
        if (selectedIds.has(opt.id)) {
          extra += opt.price_impact;
        }
      });
    });
    return product.base_price + extra;
  }, [groups, selections, product.base_price]);

  const handleConfirm = () => {
    const modifiers: CartItemModifiers[] = groups.map((group) => ({
      modifier_group_id: group.id,
      modifier_group_name: group.name,
      selections: group.options
        .filter((opt) => (selections[group.id] || new Set()).has(opt.id))
        .map((opt) => ({
          option_id: opt.id,
          option_name: opt.name,
          price_impact: opt.price_impact,
          quantity: 1,
        })),
    }));
    onConfirm(modifiers);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl max-h-[85vh] sm:max-h-[80vh] flex flex-col shadow-2xl overflow-hidden border border-zinc-100"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modifier-modal-title"
      >
        {/* Handle visual para mobile */}
        <div className="sm:hidden pt-3 flex justify-center">
          <div className="w-12 h-1.5 bg-zinc-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 py-4 sm:p-6 border-b border-zinc-100 flex items-start justify-between gap-4">
          <div>
            <h3 id="modifier-modal-title" className="text-xl font-bold text-zinc-900 tracking-tight">
              {product.name}
            </h3>
            <p className="text-xs text-zinc-500 mt-1">Personaliza las opciones de tu pedido</p>
          </div>
          <button
            onClick={onCancel}
            type="button"
            className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-800 flex items-center justify-center transition-colors shrink-0"
            aria-label="Cerrar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Opciones */}
        <div className="flex-1 overflow-y-auto px-5 py-4 sm:p-6 space-y-6">
          {groups.map((group) => {
            const selectedCount = (selections[group.id] || new Set()).size;
            const isSingle = group.max_selections === 1;

            return (
              <div key={group.id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-semibold text-zinc-800 text-sm flex items-center gap-1.5">
                      {group.name}
                      {group.is_required && (
                        <span className="text-[10px] uppercase font-bold tracking-wider text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                          Obligatorio
                        </span>
                      )}
                    </label>
                  </div>
                  <span className="text-xs font-medium text-zinc-400">
                    {isSingle
                      ? 'Elige 1 opción'
                      : group.max_selections > 0
                        ? `Hasta ${group.max_selections}`
                        : 'Opcional'}
                  </span>
                </div>

                <div className="grid gap-2">
                  {group.options.map((opt) => {
                    const isSelected = (selections[group.id] || new Set()).has(opt.id);

                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleOption(group.id, opt.id, group)}
                        className={`flex items-center justify-between p-3.5 rounded-xl border text-left transition-all select-none active:scale-[0.99] ${
                          isSelected
                            ? 'border-orange-600 bg-orange-50/50 shadow-sm ring-1 ring-orange-600/30'
                            : 'border-zinc-200 hover:border-zinc-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-5 h-5 rounded-${isSingle ? 'full' : 'md'} flex items-center justify-center border transition-colors ${
                              isSelected
                                ? 'bg-orange-600 border-orange-600 text-white'
                                : 'border-zinc-300 bg-white'
                            }`}
                          >
                            {isSelected && (isSingle ? <span className="w-2 h-2 rounded-full bg-white" /> : <Check className="w-3.5 h-3.5 stroke-[3]" />)}
                          </div>
                          <span className={`text-sm font-medium ${isSelected ? 'text-zinc-900 font-semibold' : 'text-zinc-700'}`}>
                            {opt.name}
                          </span>
                        </div>

                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded-md ${
                            opt.price_impact === 0
                              ? 'text-zinc-400 bg-zinc-50'
                              : isSelected
                                ? 'text-orange-700 bg-orange-100/60'
                                : 'text-zinc-600 bg-zinc-100'
                          }`}
                        >
                          {opt.price_impact === 0 ? 'Gratis' : `+${formatMXN(opt.price_impact)}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-zinc-100 bg-zinc-50/80 pb-safe">
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Precio total</span>
            <span className="text-xl font-extrabold text-orange-600">{formatMXN(totalPrice)}</span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-3 rounded-xl text-sm font-semibold text-zinc-600 bg-white border border-zinc-200 hover:bg-zinc-100 active:scale-95 transition-all"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!isValid}
              className={`px-4 py-3 rounded-xl text-sm font-semibold text-white transition-all shadow-md active:scale-95 ${
                isValid
                  ? 'bg-orange-600 hover:bg-orange-700 shadow-orange-600/25'
                  : 'bg-zinc-300 text-zinc-500 shadow-none cursor-not-allowed'
              }`}
            >
              Agregar al pedido
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

