'use client';

import type { Product } from '@/lib/types';
import { formatMXN } from '@/lib/pricing';

interface Props {
  product: Product;
  quantity: number;
  onAdd: (product: Product, qty: number) => void;
}

export default function AddToCartButton({ product, quantity, onAdd }: Props) {
  const price = product.base_price * quantity;
  return (
    <button
      onClick={() => onAdd(product, quantity)}
      className="ml-auto rounded-lg bg-orange-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-orange-700 transition"
    >
      Agregar · {formatMXN(price)}
    </button>
  );
}