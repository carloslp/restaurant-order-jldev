'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import type { Product, CartItemModifiers } from '@/lib/types';
import { formatMXN } from '@/lib/pricing';
import {
  calculateProductTotalPrice,
  toggleGroupOption,
  getModifierGroupBadge,
  getActionButtonState,
} from '@/lib/modifiers';
import { X, Check, AlertCircle, Plus, Minus } from 'lucide-react';

interface Props {
  product: Product;
  initialQuantity?: number;
  onConfirm: (modifiers: CartItemModifiers[], comments: string, quantity?: number) => void;
  onCancel: () => void;
}

export default function ModifierSelector({
  product,
  initialQuantity = 1,
  onConfirm,
  onCancel,
}: Props) {
  const groups = product.modifier_groups || [];

  // Estado: modifier_group_id -> Set de option_ids
  const [selections, setSelections] = useState<Record<string, Set<string>>>({});
  const [quantity, setQuantity] = useState<number>(Math.max(1, initialQuantity));
  const [comments, setComments] = useState('');
  const [limitWarnings, setLimitWarnings] = useState<Record<string, string>>({});

  // Bloquear scroll de fondo en móvil mientras el BottomSheet esté abierto
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onCancel]);

  const handleToggleOption = useCallback(
    (groupId: string, optionId: string) => {
      const group = groups.find((g) => g.id === groupId);
      if (!group) return;

      const current = selections[groupId] || new Set();
      const res = toggleGroupOption(group, current, optionId);

      if (res.blocked) {
        // CA-3: Límite máximo alcanzado -> bloquear tercera selección y mostrar microcopy inline
        if (res.limitWarning) {
          setLimitWarnings((prev) => ({ ...prev, [groupId]: res.limitWarning! }));
        }
      } else {
        // Selección exitosa o deselección: actualizar y limpiar advertencia
        setSelections((prev) => ({ ...prev, [groupId]: res.nextSelections }));
        if (limitWarnings[groupId]) {
          setLimitWarnings((prev) => {
            const next = { ...prev };
            delete next[groupId];
            return next;
          });
        }
      }
    },
    [groups, selections, limitWarnings]
  );

  // CA-2: Cálculo dinámico de precio incremental sin latencia
  const totalPrice = useMemo(() => {
    return calculateProductTotalPrice(product, selections, quantity);
  }, [product, selections, quantity]);

  // CA-1: Validación y texto del botón de acción
  const actionButtonState = useMemo(() => {
    return getActionButtonState(groups, selections, totalPrice);
  }, [groups, selections, totalPrice]);

  const handleConfirm = () => {
    if (!actionButtonState.isValid) return;

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

    onConfirm(modifiers, comments, quantity);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-zinc-950/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl max-h-[90vh] sm:max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-zinc-100 animate-in slide-in-from-bottom duration-300"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modifier-modal-title"
      >
        {/* Handle visual para mobile BottomSheet (área de agarre táctil) */}
        <div className="sm:hidden pt-3 pb-1 flex justify-center shrink-0" aria-hidden="true">
          <div className="w-12 h-1.5 bg-zinc-300 rounded-full" />
        </div>

        {/* Header con contraste accesible y botón de cierre ≥ 48px */}
        <div className="px-5 py-4 sm:p-6 border-b border-zinc-100 flex items-start justify-between gap-4 shrink-0 bg-white">
          <div className="flex-1 pr-2">
            <h3
              id="modifier-modal-title"
              className="text-xl font-extrabold text-zinc-900 tracking-tight"
            >
              {product.name}
            </h3>
            <p className="text-xs font-medium text-zinc-600 mt-1">
              {groups.length > 0
                ? 'Personaliza las opciones y requerimientos de tu pedido'
                : 'Instrucciones especiales o notas de preparación'}
            </p>
            {product.description && (
              <p className="text-xs text-zinc-600 mt-1 line-clamp-2">
                {product.description}
              </p>
            )}
          </div>
          <button
            onClick={onCancel}
            type="button"
            className="min-w-[48px] min-h-[48px] w-12 h-12 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 hover:text-zinc-900 flex items-center justify-center transition-colors shrink-0 active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido scrolleable de grupos de modificadores */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 overscroll-contain">
          {groups.map((group) => {
            const currentSelected = selections[group.id] || new Set();
            const isSingle = group.max_selections === 1;
            const badge = getModifierGroupBadge(group);
            const warning = limitWarnings[group.id];

            return (
              <fieldset
                key={group.id}
                className="space-y-3 border-0 p-0 m-0"
                role={isSingle ? 'radiogroup' : 'group'}
                aria-labelledby={`group-title-${group.id}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <legend
                    id={`group-title-${group.id}`}
                    className="font-bold text-zinc-900 text-sm flex items-center gap-2"
                  >
                    <span>{group.name}</span>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-bold border transition-colors ${
                        badge.isRequired
                          ? 'bg-red-100 text-red-800 border-red-200'
                          : 'bg-zinc-100 text-zinc-700 border-zinc-200'
                      }`}
                    >
                      {badge.label}
                    </span>
                  </legend>

                  {!isSingle && group.max_selections > 1 && (
                    <span className="text-xs font-semibold text-zinc-600">
                      {currentSelected.size}/{group.max_selections} seleccionados
                    </span>
                  )}
                </div>

                {/* CA-3: Microcopy inline cuando se intenta exceder el tope máximo */}
                {warning && (
                  <div
                    role="alert"
                    aria-live="polite"
                    id={`limit-warning-${group.id}`}
                    className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold animate-in fade-in duration-150"
                  >
                    <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>{warning}</span>
                  </div>
                )}

                {/* Lista de opciones con controles táctiles ≥ 44px y foco accesible emerald-500 */}
                <div className="grid grid-cols-1 gap-2.5">
                  {group.options.map((opt) => {
                    const isSelected = currentSelected.has(opt.id);

                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role={isSingle ? 'radio' : 'checkbox'}
                        aria-checked={isSelected}
                        aria-describedby={warning ? `limit-warning-${group.id}` : undefined}
                        onClick={() => handleToggleOption(group.id, opt.id)}
                        className={`min-h-[48px] min-w-[44px] w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all select-none active:scale-[0.99] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
                          isSelected
                            ? 'border-orange-600 bg-orange-50/70 shadow-xs ring-1 ring-orange-600/40'
                            : 'border-zinc-300 hover:border-zinc-400 bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Contenedor del radio o checkbox */}
                          <div
                            className={`min-w-[24px] min-h-[24px] w-6 h-6 rounded-${
                              isSingle ? 'full' : 'md'
                            } flex items-center justify-center border-2 transition-colors shrink-0 ${
                              isSelected
                                ? 'bg-orange-600 border-orange-600 text-white'
                                : 'border-zinc-400 bg-white'
                            }`}
                          >
                            {isSelected &&
                              (isSingle ? (
                                <span className="w-2.5 h-2.5 rounded-full bg-white" />
                              ) : (
                                <Check className="w-4 h-4 stroke-[3]" />
                              ))}
                          </div>
                          <span
                            className={`text-sm ${
                              isSelected
                                ? 'font-bold text-zinc-900'
                                : 'font-semibold text-zinc-800'
                            }`}
                          >
                            {opt.name}
                          </span>
                        </div>

                        <span
                          className={`text-xs px-2.5 py-1 rounded-md font-bold transition-colors ${
                            opt.price_impact === 0
                              ? 'text-zinc-700 bg-zinc-100'
                              : isSelected
                                ? 'text-orange-950 bg-orange-200/80 border border-orange-300'
                                : 'text-zinc-800 bg-zinc-100 border border-zinc-200'
                          }`}
                        >
                          {opt.price_impact === 0 ? 'Gratis' : `+${formatMXN(opt.price_impact)}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}

          {/* Instrucciones de preparación / comentarios */}
          <div className="pt-2">
            <label
              htmlFor="product-comments"
              className="block text-xs font-bold text-zinc-800 uppercase tracking-wider mb-2 flex items-center justify-between"
            >
              <span>Instrucciones de preparación / comentarios</span>
              <span className="text-xs text-zinc-600 font-medium normal-case">
                Opcional · máx. 250 caract.
              </span>
            </label>
            <textarea
              id="product-comments"
              rows={3}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              autoFocus={groups.length === 0}
              placeholder="Ej. Sin cebolla, término medio, salsa aparte, alérgico a..."
              className="w-full min-h-[48px] rounded-xl border border-zinc-300 bg-zinc-50 focus:bg-white p-3 text-sm text-zinc-900 placeholder:text-zinc-500 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all resize-none"
              maxLength={250}
            />
          </div>
        </div>

        {/* Footer fijo con selector de cantidad, resumen de precio y botón de acción */}
        <div className="p-4 sm:p-5 border-t border-zinc-100 bg-zinc-50/95 backdrop-blur-xs pb-safe shrink-0">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-zinc-700 uppercase tracking-wider">
                Cantidad:
              </span>
              <div className="flex items-center bg-white rounded-xl border border-zinc-300 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="min-w-[48px] min-h-[48px] rounded-l-xl flex items-center justify-center text-zinc-700 hover:text-zinc-900 disabled:opacity-30 disabled:cursor-not-allowed active:bg-zinc-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                  aria-label="Disminuir cantidad"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-8 text-center font-bold text-sm text-zinc-900 select-none">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  className="min-w-[48px] min-h-[48px] rounded-r-xl flex items-center justify-center text-zinc-700 hover:text-zinc-900 active:bg-zinc-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                  aria-label="Aumentar cantidad"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs font-semibold text-zinc-600 block uppercase tracking-wider">
                Precio total
              </span>
              <span className="text-xl font-extrabold text-orange-600">
                {formatMXN(totalPrice)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-[48px] min-w-[44px] px-4 py-3 rounded-xl text-sm font-bold text-zinc-700 bg-white border border-zinc-300 hover:bg-zinc-100 active:scale-95 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            >
              Cancelar
            </button>

            {/* US-01: Botón de acción con texto contextual y precio dinámico */}
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!actionButtonState.isValid}
              className={`min-h-[48px] min-w-[44px] flex-1 px-4 py-3 rounded-xl text-sm font-bold transition-all shadow-md active:scale-95 flex items-center justify-center text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
                actionButtonState.isValid
                  ? 'bg-orange-600 hover:bg-orange-700 text-white shadow-orange-600/25 cursor-pointer'
                  : 'bg-zinc-200 text-zinc-700 shadow-none cursor-not-allowed border border-zinc-300'
              }`}
              aria-label={
                actionButtonState.isValid
                  ? `Agregar al pedido por ${actionButtonState.formattedPrice}`
                  : actionButtonState.buttonText
              }
            >
              {actionButtonState.buttonText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
