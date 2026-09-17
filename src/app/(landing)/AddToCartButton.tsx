'use client';

import type { Product } from '@/lib/types';
import { formatMXN } from '@/lib/pricing';

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
      onClick={() => onAdd(product, quantity)}
      disabled={disabled}
      className={`ml-auto rounded-lg px-4 py-1.5 text-sm font-semibold text-white transition ${
        disabled
          ? 'bg-gray-400 cursor-not-allowed'
          : 'bg-orange-600 hover:bg-orange-700'
      }`}
    >
      {disabled ? 'No disponible' : `Agregar · ${formatMXN(price)}`}
    </button>
  );
}