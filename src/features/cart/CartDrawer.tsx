'use client';

import { useCart, itemKey } from '@/features/cart/CartContext';
import { formatMXN, linePrice } from '@/lib/pricing';
import Link from 'next/link';
import { 
  X, 
  ShoppingBag, 
  Plus, 
  Minus, 
  Trash2, 
  ArrowRight,
  ShieldCheck,
  Edit2,
  Check
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface CartDrawerProps {
  slug: string;
  checkoutHref?: string;
}

export function CartDrawer({ slug, checkoutHref }: CartDrawerProps) {
  const { 
    isOpen, 
    setOpen, 
    cart, 
    count, 
    total, 
    updateQuantity, 
    updateComments,
    removeItem, 
    clearCart 
  } = useCart();

  const [editingCommentKey, setEditingCommentKey] = useState<string | null>(null);
  const [draftComment, setDraftComment] = useState('');

  // Bloquear scroll del body cuando el drawer esté abierto
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop oscuro */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Panel lateral deslizante */}
      <aside 
        className="relative z-10 w-full max-w-md bg-white h-full shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-300"
        role="dialog"
        aria-label="Carrito de compras"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-200/80 flex items-center justify-between bg-zinc-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900">Tu Pedido</h2>
              <p className="text-xs text-zinc-500">
                {count === 0 ? 'Sin artículos' : `${count} ${count === 1 ? 'artículo' : 'artículos'}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {cart.items.length > 0 && (
              <button
                type="button"
                onClick={() => clearCart()}
                className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-red-600 px-2.5 py-1.5 rounded-lg border border-zinc-200 hover:border-red-200 hover:bg-red-50 transition-colors"
                title="Eliminar todos los productos del carrito"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Vaciar</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
              aria-label="Cerrar carrito"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Lista de productos */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 divide-y divide-zinc-100">
          {cart.items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-800">Tu carrito está vacío</h3>
                <p className="text-xs text-zinc-400 mt-1 max-w-xs">
                  Aún no has agregado ningún platillo. Explora el menú para añadir tus opciones favoritas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mt-2 text-xs font-semibold text-orange-600 hover:text-orange-700 underline"
              >
                Volver al menú
              </button>
            </div>
          ) : (
            cart.items.map((item) => {
              const key = itemKey(item);
              const flatMods = item.modifiers.flatMap((m) =>
                m.selections.map((s) => ({
                  price_impact: s.price_impact,
                  quantity: s.quantity,
                }))
              );
              const itemTotal = linePrice({
                base_price: item.base_price,
                quantity: item.quantity,
                modifiers: flatMods,
              });

              return (
                <div key={key} className="pt-3 first:pt-0 space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <div className="font-semibold text-sm text-zinc-900">
                      <span>{item.product_name}</span>
                    </div>
                    <span className="font-bold text-sm text-zinc-900 shrink-0 font-mono">
                      {formatMXN(itemTotal)}
                    </span>
                  </div>

                  {/* Modificadores */}
                  {item.modifiers.length > 0 && (
                    <div className="pl-2 border-l-2 border-orange-200 space-y-0.5 text-xs text-zinc-500">
                      {item.modifiers.map((m) =>
                        m.selections.map((s) => (
                          <div key={s.option_id} className="flex justify-between">
                            <span>+ {s.option_name}</span>
                            {s.price_impact > 0 && (
                              <span className="text-zinc-400">+{formatMXN(s.price_impact * s.quantity)}</span>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Observaciones o notas del producto */}
                  {editingCommentKey === key ? (
                    <div className="p-2 bg-zinc-50 rounded-lg border border-orange-200 space-y-2">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-600">
                        Nota de preparación:
                      </label>
                      <input
                        type="text"
                        value={draftComment}
                        onChange={(e) => setDraftComment(e.target.value)}
                        placeholder="Ej. Sin cebolla, salsa aparte..."
                        className="w-full text-xs p-1.5 rounded border border-zinc-300 bg-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                        maxLength={150}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            updateComments(key, draftComment);
                            setEditingCommentKey(null);
                          }
                        }}
                      />
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingCommentKey(null)}
                          className="text-[11px] px-2 py-0.5 rounded text-zinc-500 hover:bg-zinc-200"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            updateComments(key, draftComment);
                            setEditingCommentKey(null);
                          }}
                          className="text-[11px] px-2 py-0.5 rounded bg-orange-600 text-white font-medium hover:bg-orange-700"
                        >
                          Guardar
                        </button>
                      </div>
                    </div>
                  ) : item.comments ? (
                    <div className="pl-2.5 border-l-2 border-amber-400 bg-amber-50/70 rounded-r-lg py-1 px-2 text-xs text-amber-900 flex items-start justify-between gap-2">
                      <div>
                        <span className="font-bold text-[10px] uppercase tracking-wider block text-amber-800">
                          Observación:
                        </span>
                        <span className="italic">{item.comments}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCommentKey(key);
                          setDraftComment(item.comments || '');
                        }}
                        className="text-[11px] text-amber-700 hover:text-amber-900 font-medium underline shrink-0 cursor-pointer"
                        title="Editar observación"
                      >
                        Editar
                      </button>
                    </div>
                  ) : (
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCommentKey(key);
                          setDraftComment('');
                        }}
                        className="text-[11px] text-zinc-500 hover:text-orange-600 inline-flex items-center gap-1 hover:underline cursor-pointer"
                      >
                        <span>+ Agregar nota al producto</span>
                      </button>
                    </div>
                  )}

                  {/* Controles de Cantidad y Eliminar */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center bg-zinc-100 rounded-lg p-0.5 border border-zinc-200">
                      <button
                        type="button"
                        onClick={() => {
                          if (item.quantity <= 1) {
                            removeItem(key);
                          } else {
                            updateQuantity(key, item.quantity - 1);
                          }
                        }}
                        className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-600 hover:text-zinc-900 active:bg-zinc-200 transition-colors"
                        aria-label="Disminuir cantidad"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-7 text-center font-bold text-xs text-zinc-800 select-none">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(key, item.quantity + 1)}
                        className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-600 hover:text-zinc-900 active:bg-zinc-200 transition-colors"
                        aria-label="Aumentar cantidad"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeItem(key)}
                      className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-red-600 transition-colors px-2 py-1 rounded hover:bg-red-50"
                      aria-label="Eliminar producto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Eliminar</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer con Totales y Botón de Checkout */}
        {cart.items.length > 0 && (
          <div className="p-4 sm:p-5 border-t border-zinc-200/80 bg-zinc-50/50 space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-sm font-semibold text-zinc-600">Total estimado</span>
              <span className="text-xl font-extrabold text-orange-600 font-mono">
                {formatMXN(total)}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 justify-end">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>IVA incluido (16%)</span>
            </div>

            <Link
              href={checkoutHref || `/${slug}/checkout`}
              onClick={() => setOpen(false)}
              className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm py-3.5 px-4 rounded-xl shadow-lg shadow-orange-600/25 active:scale-[0.98] transition-all"
            >
              <span>{checkoutHref?.includes('mesa=') ? 'Enviar pedido a Cocina' : 'Ir al Checkout'}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </aside>
    </div>
  );
}
