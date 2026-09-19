'use client';

import { useState, useMemo, useCallback } from 'react';
import type { Category, Product, CartItemModifiers } from '@/lib/types';
import { formatMXN, linePrice } from '@/lib/pricing';
import AddToCartButton from './AddToCartButton';
import ModifierSelector from './ModifierSelector';
import { useCart } from '@/features/cart/CartContext';
import Link from 'next/link';
import { useProductAvailability } from '@/features/menu/useProductAvailability';
import { 
  UtensilsCrossed, 
  Search, 
  X, 
  ShoppingBag, 
  ArrowRight, 
  Plus, 
  Minus, 
  AlertTriangle, 
  Leaf, 
  Info,
  ShieldCheck
} from 'lucide-react';

interface Props {
  local: { name: string; slug: string; iva_rate: number; delivery_fee: number } | null;
  locationId: string;
  categories: Category[];
  products: Product[];
  allergens: string[];
  dietLabels: string[];
  searchTerm: string;
}

export default function MenuClient({
  local,
  locationId,
  categories,
  products,
  allergens,
  dietLabels,
  searchTerm: initialSearchTerm,
}: Props) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState(initialSearchTerm || '');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [modifierProduct, setModifierProduct] = useState<Product | null>(null);
  const { cart, addItem } = useCart();

  // Hook para disponibilidad en tiempo real
  const productIds = useMemo(() => products.map((p) => p.id), [products]);
  const { availability } = useProductAvailability({
    locationId,
    productIds,
    enabled: !!locationId && productIds.length > 0,
  });

  const isProductAvailable = useCallback(
    (productId: string) => {
      return availability[productId] ?? true;
    },
    [availability]
  );

  // Filtro de productos por búsqueda (nombre o descripción)
  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products;
    const term = search.toLowerCase().trim();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.description && p.description.toLowerCase().includes(term))
    );
  }, [products, search]);

  // Lista de categorías visibles con conteo de productos
  const visibleCategories: (Category & { count?: number })[] = useMemo(() => {
    if (categories.length > 0) {
      return categories
        .filter((cat) => filteredProducts.some((p) => p.category_id === cat.id))
        .map((cat) => ({
          ...cat,
          count: filteredProducts.filter((p) => p.category_id === cat.id).length,
        }));
    }
    if (filteredProducts.length > 0) {
      return [
        {
          id: 'todos',
          location_id: filteredProducts[0].location_id,
          name: 'Menú principal',
          description: '',
          image_url: null,
          is_active: true,
          sort_order: 0,
          count: filteredProducts.length,
        },
      ];
    }
    return [];
  }, [categories, filteredProducts]);

  const productsByCategory = (cat: Category) =>
    filteredProducts.filter((p) => p.category_id === cat.id);

  const updateQuantity = (productId: string, delta: number) => {
    setQuantities((prev) => {
      const current = prev[productId] ?? 1;
      const next = Math.max(1, current + delta);
      return { ...prev, [productId]: next };
    });
  };

  const addToCart = useCallback(
    (product: Product, qty: number, modifiers: CartItemModifiers[] = []) => {
      if (qty <= 0) return;
      if (product.modifier_groups && product.modifier_groups.length > 0) {
        setModifierProduct(product);
      } else {
        addItem(product, qty, modifiers);
      }
    },
    [addItem]
  );

  const cartTotal = useMemo(
    () =>
      cart.items.reduce(
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

  const cartItemsCount = useMemo(
    () => cart.items.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  if (!local) {
    return (
      <main className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center border border-zinc-200">
          <div className="w-14 h-14 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <UtensilsCrossed className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Restaurant Order</h1>
          <p className="text-zinc-500 text-sm mt-2 leading-relaxed">
            Configura las variables de entorno para vincular este menú a tu catálogo Supabase.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FAFAFA] text-zinc-900 pb-28">
      {/* Header del Restaurante */}
      <header className="relative bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-950 text-white overflow-hidden border-b border-zinc-800">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#f97316_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-orange-600/90 text-white flex items-center justify-center shadow-lg shadow-orange-600/30 ring-2 ring-white/10 shrink-0">
                <UtensilsCrossed className="w-7 h-7 sm:w-8 sm:h-8" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                    {local.name}
                  </h1>
                </div>
                <p className="text-xs sm:text-sm text-zinc-400 mt-1 flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Abierto para pedidos</span>
                  <span>·</span>
                  <Link href="/" className="text-orange-400 hover:text-orange-300 transition-colors">
                    Cambiar sucursal
                  </Link>
                </p>
              </div>
            </div>

            {/* Badges de Información Legal e Higiene */}
            <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 text-white/90 text-xs font-medium backdrop-blur-sm">
                <ShieldCheck className="w-3.5 h-3.5 text-orange-400" />
                IVA incluido (16%)
              </span>
              {local.delivery_fee > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 text-white/90 text-xs font-medium">
                  Envío: {formatMXN(local.delivery_fee)}
                </span>
              )}
            </div>
          </div>

          {/* Etiquetas generales de alérgenos o dietas si existen */}
          {(dietLabels.length > 0 || allergens.length > 0) && (
            <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center gap-2 text-xs text-zinc-300">
              <span className="text-zinc-400 flex items-center gap-1 font-medium">
                <Info className="w-3.5 h-3.5" /> Características:
              </span>
              {dietLabels.map((diet) => (
                <span key={diet} className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {diet}
                </span>
              ))}
              {allergens.length > 0 && (
                <span className="text-amber-300/80">
                  Alérgenos presentes: {allergens.join(', ')}
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Barra de Filtros y Búsqueda */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-zinc-200/80 shadow-xs">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-3 space-y-3">
          {/* Buscador */}
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar platillos, bebidas, ingredientes..."
              className="w-full bg-zinc-100/80 hover:bg-zinc-100 focus:bg-white text-zinc-900 placeholder:text-zinc-400 text-sm pl-10 pr-9 py-2.5 rounded-xl border border-transparent focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 hover:text-zinc-600 flex items-center justify-center rounded-full"
                aria-label="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Carrusel de categorías */}
          {visibleCategories.length > 1 && (
            <nav className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4 sm:mx-0 sm:px-0" aria-label="Categorías del menú">
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all select-none active:scale-95 ${
                  activeCategory === null
                    ? 'bg-orange-600 text-white shadow-sm shadow-orange-600/30'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900'
                }`}
              >
                Todos ({filteredProducts.length})
              </button>
              {visibleCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all select-none active:scale-95 ${
                    activeCategory === cat.id
                      ? 'bg-orange-600 text-white shadow-sm shadow-orange-600/30'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900'
                  }`}
                >
                  {cat.name} {cat.count !== undefined && <span className="opacity-75 text-[11px] ml-0.5">({cat.count})</span>}
                </button>
              ))}
            </nav>
          )}
        </div>
      </div>

      {/* Lista de Productos por Categoría */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
        {filteredProducts.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 bg-zinc-100 text-zinc-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-zinc-800">No encontramos resultados</h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-xs mx-auto">
              Intenta con otra palabra clave o revisa la ortografía.
            </p>
            {search && (
              <button
                onClick={() => setSearch('')}
                className="mt-4 text-xs font-semibold text-orange-600 hover:text-orange-700 underline underline-offset-4"
              >
                Limpiar búsqueda
              </button>
            )}
          </div>
        ) : (
          visibleCategories.map((cat) => {
            const items = productsByCategory(cat);
            if (!items.length) return null;
            if (activeCategory !== null && activeCategory !== cat.id) return null;

            return (
              <div key={cat.id} id={cat.id} className="mb-10 last:mb-0">
                <div className="flex items-baseline justify-between mb-4 border-b border-zinc-200/80 pb-2">
                  <div className="flex items-center gap-3">
                    {cat.image_url && (
                      <img
                        src={cat.image_url}
                        alt=""
                        loading="lazy"
                        className="w-9 h-9 rounded-lg object-cover border border-zinc-200 bg-zinc-100 shrink-0"
                      />
                    )}
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">
                      {cat.name}
                    </h2>
                  </div>
                  <span className="text-xs font-medium text-zinc-400">
                    {items.length} {items.length === 1 ? 'platillo' : 'platillos'}
                  </span>
                </div>

                <div className="grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-2">
                  {items.map((p) => {
                    const qty = quantities[p.id] ?? 1;
                    const available = isProductAvailable(p.id);

                    return (
                      <article
                        key={p.id}
                        className={`group relative bg-white rounded-2xl border border-zinc-200/80 p-4 sm:p-5 shadow-xs hover:shadow-md hover:border-zinc-300 transition-all flex flex-col justify-between ${
                          !available ? 'opacity-60 bg-zinc-50/70' : ''
                        }`}
                      >
                        <div>
                          {/* Foto del producto (Supabase Storage) */}
                          {p.image_url && (
                            <img
                              src={p.image_url}
                              alt={p.name}
                              loading="lazy"
                              className="w-full aspect-[4/3] object-cover rounded-xl border border-zinc-200/80 bg-zinc-100 mb-3"
                            />
                          )}

                          {/* Título y Estado */}
                          <div className="flex items-start justify-between gap-3 mb-1.5">
                            <h3 className="font-bold text-zinc-900 text-base group-hover:text-orange-600 transition-colors">
                              {p.name}
                            </h3>
                            {!available && (
                              <span className="shrink-0 rounded-md bg-red-50 border border-red-200 px-2 py-0.5 text-[11px] font-bold text-red-600 uppercase tracking-wider">
                                Agotado
                              </span>
                            )}
                          </div>

                          {/* Descripción */}
                          {p.description && (
                            <p className="text-xs sm:text-sm text-zinc-500 leading-relaxed line-clamp-2">
                              {p.description}
                            </p>
                          )}

                          {/* Chips de alérgenos y dietas */}
                          <div className="flex flex-wrap gap-1.5 mt-2.5">
                            {p.diet_labels &&
                              p.diet_labels.map((diet) => (
                                <span
                                  key={diet}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-200/60"
                                >
                                  <Leaf className="w-3 h-3" />
                                  {diet}
                                </span>
                              ))}
                            {p.allergens &&
                              p.allergens.map((alg) => (
                                <span
                                  key={alg}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md border border-amber-200/60"
                                >
                                  <AlertTriangle className="w-3 h-3" />
                                  {alg}
                                </span>
                              ))}
                          </div>
                        </div>

                        {/* Pie de tarjeta: Precio y Controles */}
                        <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between gap-3">
                          <div>
                            <span className="text-xs text-zinc-400 block font-medium">Precio</span>
                            <span className="text-lg font-extrabold text-zinc-900">
                              {formatMXN(p.base_price)}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Stepper táctil ergonómico */}
                            {available && (
                              <div className="flex items-center bg-zinc-100 rounded-xl p-0.5 border border-zinc-200">
                                <button
                                  type="button"
                                  onClick={() => updateQuantity(p.id, -1)}
                                  disabled={qty <= 1}
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-600 hover:text-zinc-900 disabled:opacity-30 disabled:cursor-not-allowed active:bg-zinc-200 transition-colors"
                                  aria-label="Disminuir cantidad"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="w-7 text-center font-bold text-xs text-zinc-800 select-none">
                                  {qty}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => updateQuantity(p.id, 1)}
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-600 hover:text-zinc-900 active:bg-zinc-200 transition-colors"
                                  aria-label="Aumentar cantidad"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}

                            {/* Botón de agregar */}
                            <AddToCartButton
                              product={p}
                              quantity={qty}
                              onAdd={addToCart}
                              disabled={!available}
                            />
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Barra flotante inferior de Carrito estilo App */}
      {cart.items.length > 0 && (
        <aside className="fixed bottom-4 inset-x-0 z-30 flex justify-center px-4 pointer-events-none pb-safe">
          <Link
            href={`/${local.slug}/checkout`}
            className="pointer-events-auto w-full max-w-md bg-zinc-950 text-white rounded-2xl p-3.5 shadow-2xl shadow-zinc-950/40 border border-white/10 flex items-center justify-between gap-3 hover:bg-zinc-900 active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="relative w-11 h-11 rounded-xl bg-orange-600 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-orange-600/30">
                <ShoppingBag className="w-5 h-5" />
                <span className="absolute -top-1 -right-1 bg-white text-zinc-900 text-[11px] font-extrabold w-5 h-5 rounded-full flex items-center justify-center shadow-xs">
                  {cartItemsCount}
                </span>
              </div>
              <div className="text-left">
                <p className="text-xs text-zinc-400 font-medium">Ver mi pedido</p>
                <p className="text-base font-extrabold text-white">{formatMXN(cartTotal)}</p>
              </div>
            </div>

            <div className="inline-flex items-center gap-1.5 bg-orange-600 hover:bg-orange-500 text-white px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm tracking-wide transition-colors">
              <span>Checkout</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </Link>
        </aside>
      )}

      {/* Selector Modal / Bottom-Sheet de Modificadores */}
      {modifierProduct && (
        <ModifierSelector
          product={modifierProduct}
          onConfirm={(modifiers) => {
            const qty = quantities[modifierProduct.id] ?? 1;
            addItem(modifierProduct, qty, modifiers);
            setModifierProduct(null);
          }}
          onCancel={() => setModifierProduct(null)}
        />
      )}
    </main>
  );
}

