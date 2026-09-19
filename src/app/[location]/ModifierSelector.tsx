'use client';

import { useState, useMemo } from 'react';
import type { Product, ModifierGroup, ModifierOption, CartItemModifiers } from '@/lib/types';
import { formatMXN } from '@/lib/pricing';

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
        if (group.max_selections > 0 && current.size >= group.max_selections) {
          return prev; // Max reached
        }
        current.add(optionId);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] flex flex-col shadow-2xl">
        <div className="p-4 border-b">
          <h3 className="text-xl font-bold text-gray-800">{product.name}</h3>
          <p className="text-sm text-gray-500">Personaliza tu pedido</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {groups.map((group) => (
            <div key={group.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-gray-700">
                  {group.name}
                  {group.is_required && <span className="text-red-500 ml-1">*</span>}
                </label>
                <span className="text-xs text-gray-400">
                  {group.max_selections === 0 ? 'Opcional' : `Máx ${group.max_selections}`}
                </span>
              </div>
              
              <div className="grid gap-2">
                {group.options.map((opt) => {
                  const isSelected = (selections[group.id] || new Set()).has(opt.id);
                  return (
                    <button
                      key={opt.id}
                      onClick={() => toggleOption(group.id, opt.id, group)}
                      className={`flex items-center justify-between p-3 rounded-lg border transition ${
                        isSelected 
                          ? 'border-orange-600 bg-orange-50 ring-1 ring-orange-600' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-sm font-medium text-gray-700">{opt.name}</span>
                      <span className={`text-sm ${opt.price_impact === 0 ? 'text-gray-400' : 'text-orange-600 font-semibold'}`}>
                        {opt.price_impact === 0 ? 'Gratis' : `+${formatMXN(opt.price_impact)}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t bg-gray-50 rounded-b-2xl">
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-600">Total</span>
            <span className="text-2xl font-bold text-orange-700">{formatMXN(totalPrice)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold text-gray-600 bg-gray-200 hover:bg-gray-300 transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={!isValid}
              className={`px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition ${
                isValid ? 'bg-orange-600 hover:bg-orange-700' : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              Agregar al carrito
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
