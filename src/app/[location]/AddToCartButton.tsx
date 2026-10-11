'use client';

import type { Product } from '@/lib/types';
import { formatMXN } from '@/lib/pricing';
import { Plus } from 'lucide-react';

interface Props {
  product: Product;
  quantity: number;
  onAdd: (product: Product, qty: number) => void;
  disabled?: boolean;
}

export default function AddToCartButton({ product, quantity, onAdd, disabled = false }: Props) {
  const price = product.base_price * quantity;
  return (
    <button
      type="button"
      onClick={() => onAdd(product, quantity)}
      disabled={disabled}
      className={`min-h-[48px] min-w-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all active:scale-95 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
        disabled
          ? 'bg-zinc-300 text-zinc-500 cursor-not-allowed shadow-none'
          : 'bg-orange-600 hover:bg-orange-700 active:bg-orange-800 shadow-orange-600/20'
      }`}
      aria-label={`Agregar ${quantity} ${product.name} al carrito`}
    >
      {!disabled && <Plus className="w-4 h-4" />}
      <span>
        {disabled
          ? 'Agotado'
          : (product.modifier_groups && product.modifier_groups.length > 0)
            ? `Personalizar · ${formatMXN(price)}`
            : `Agregar · ${formatMXN(price)}`}
      </span>
    </button>
  );
}