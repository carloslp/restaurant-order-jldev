'use client';

import { useState, useMemo, useCallback } from 'react';
import type { Category, Product } from '@/lib/types';
import { formatMXN, linePrice } from '@/lib/pricing';
import AddToCartButton from './AddToCartButton';
import { useCart } from '@/features/cart/CartContext';

interface Props {
  local: { name: string; subdomain: string; iva_rate: number; delivery_fee: number } | null;
  categories: Category[];
  products: Product[];
  allergens: string[];
  dietLabels: string[];
  searchTerm: string;
}

export default function MenuClient({
  local,
  categories,
  products,
  allergens,
  dietLabels,
  searchTerm,
}: Props) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const { cart, addItem, updateQuantity, removeItem, clearCart, count } = useCart();

  // No need for local cart effects; CartContext handles persistence

  // Filter products by searchTerm (case-insensitive) on name and description
  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products;
    const term = searchTerm.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.description && p.description.toLowerCase().includes(term))
    );
  }, [products, searchTerm]);

  const visibleCategories: Category[] = categories.length
    ? categories
    : filteredProducts.length
      ? [
          {
            id: 'todos',
            location_id: filteredProducts[0].location_id,
            name: 'Menú',
            description: '',
            image_url: null,
            is_active: true,
            sort_order: 0,
          },
        ]
      : [];

  const productsByCategory = (cat: Category) =>
    filteredProducts.filter((p) => p.category_id === cat.id);

  const addToCart = useCallback(
    (product: Product, qty: number) => {
      if (qty <= 0) return;
      addItem(product, qty, []);
    },
    [addItem]
  );

  const cartTotal = useMemo(
    () =>
      cart.reduce(
        (sum, item) =>
          sum +
          linePrice({
            base_price: item.base_price,
            quantity: item.quantity,
            modifiers: item.modifiers.flatMap((m) => m.selections),
          }),
        0
      ),
    [cart]
  );

  if (!local) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="text-2xl font-bold">Restaurant Order JLDev</h1>
        <p className="text-gray-600 mt-2">
          Bienvenido. Este es el scaffold de la landing.
          <br />
          Configurá <code className="bg-gray-100 px-1 rounded">.env.local</code> con tu proyecto
          Supabase para ver el menú real desde el catálogo.
        </p>
        <div className="mt-6 rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          🔌 Sin conexión a Supabase — mostrando placeholder.
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-orange-50">
      {/* Header */}
      <header className="bg-orange-600 text-white">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <h1 className="text-3xl font-bold">{local.name}</h1>
          <p className="text-orange-100 mt-1 text-sm">
            {allergens.length > 0 || dietLabels.length > 0 ? (
              <>
                {dietLabels.join(', ')}
                {dietLabels.length > 0 && allergens.length > 0 ? ' · ' : ''}
                {allergens.length > 0 ? `Alérgenos: ${allergens.join(', ')}` : ''}
              </>
            ) : (
              'Precios con IVA incluido'
            )}
          </p>
        </div>
      </header>

      {/* Navegación de categorías */}
      <nav className="bg-white shadow-sm sticky top-0 z-10">
        <div className="mx-auto max-w-4xl px-4 flex gap-2 overflow-x-auto py-2">
          {visibleCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${
                activeCategory === cat.id
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </nav>

      {/* Productos */}
      <section className="mx-auto max-w-4xl px-4 py-6">
        {visibleCategories.map((cat) => {
          const items = productsByCategory(cat);
          if (!items.length) return null;
          const isActive = activeCategory === null || activeCategory === cat.id;
          return (
            <div key={cat.id} id={cat.id} className="mb-8">
              <h2 className="text-xl font-bold text-gray-800 mb-3 border-b-2 border-orange-200 pb-1">
                {cat.name}
              </h2>
              {isActive && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {items.map((p) => {
                    const qty = quantities[p.id] ?? 1;
                    return (
                      <div
                        key={p.id}
                        className="bg-white rounded-xl shadow-sm p-4 flex flex-col"
                      >
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-800">{p.name}</h3>
                          {p.description && (
                            <p className="text-sm text-gray-600 mt-1">{p.description}</p>
                          )}
                          {p.allergens && p.allergens.length > 0 && (
                            <p className="text-xs text-orange-700 mt-1">
                              ⚠️ {p.allergens.join(', ')}
                            </p>
                          )}
                          {p.diet_labels && p.diet_labels.length > 0 && (
                            <p className="text-xs text-green-700 mt-0.5">
                              {p.diet_labels.join(', ')}
                            </p>
                          )}
                          <p className="text-lg font-bold text-orange-700 mt-2">
                            {formatMXN(p.base_price)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                          <input
                            type="number"
                            min={1}
                            value={qty}
                            onChange={(e) =>
                              setQuantities((prev) => ({
                                ...prev,
                                [p.id]: Math.max(1, parseInt(e.target.value) || 1),
                              }))
                            }
                            className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm"
                            aria-label={`Cantidad de ${p.name}`}
                          />
                          <AddToCartButton product={p} quantity={qty} onAdd={addToCart} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Barra flotante del carrito */}
      {cart.length > 0 && (
        <div className="fixed bottom-4 inset-x-0 z-20 flex justify-center px-4">
          <Link href="/checkout" className="rounded-full bg-orange-600 text-white px-6 py-3 shadow-lg font-semibold hover:bg-orange-700 transition">
            Ver carrito · {cart.reduce((s, i) => s + i.quantity, 0)} ítems ·{' '}
            {formatMXN(cartTotal)}
          </Link>
        </div>
      )}
    </main>
  );
}