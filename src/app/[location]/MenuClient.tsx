'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { getPublicTableStatus } from '@/lib/server/tables';
import type { Category, Product, CartItemModifiers } from '@/lib/types';
import { formatMXN, linePrice } from '@/lib/pricing';
import AddToCartButton from './AddToCartButton';
import ModifierSelector from './ModifierSelector';
import { useCart } from '@/features/cart/CartContext';
import { CartDrawer } from '@/features/cart/CartDrawer';
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
  ShieldCheck,
  Calendar
} from 'lucide-react';

interface Props {
  local: { 
    name: string; 
    slug: string; 
    iva_rate: number; 
    delivery_fee: number; 
    is_open?: boolean;
    is_catalog_only?: boolean;
    reservations_enabled?: boolean;
  } | null;
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
  const [excludedAllergens, setExcludedAllergens] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [modifierProduct, setModifierProduct] = useState<Product | null>(null);
  const { cart, addItem, setOpen } = useCart();

  const searchParams = useSearchParams();
  const mesaParam = searchParams.get('mesa');
  const tokenParam = searchParams.get('token');
  const [tableData, setTableData] = useState<{ id: string; table_number: string; qr_status: string } | null>(null);

  useEffect(() => {
    if (mesaParam && local?.slug) {
      getPublicTableStatus(local.slug, mesaParam, tokenParam || undefined)
        .then((res) => {
          if (res.ok && res.table) {
            setTableData(res.table);
          }
        })
        .catch(() => {});
    }
  }, [mesaParam, tokenParam, local?.slug]);

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

  // CA-1.1: Filtro de productos por búsqueda y filtrado excluyente de alérgenos
  const filteredProducts = useMemo(() => {
    let result = products;

    if (search.trim()) {
      const term = search.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          (p.description && p.description.toLowerCase().includes(term))
      );
    }

    if (excludedAllergens.length > 0) {
      const exLower = excludedAllergens.map((a) => a.toLowerCase().trim());
      result = result.filter((p) => {
        const prodAllergens = (p.allergens || []).map((a) => a.toLowerCase().trim());
        return !exLower.some((ex) => prodAllergens.includes(ex));
      });
    }

    return result;
  }, [products, search, excludedAllergens]);

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

  // Scroll-spy con IntersectionObserver para sincronizar visualmente la categoría al hacer scroll
  const [activeScrollCategory, setActiveScrollCategory] = useState<string | null>(null);

  useEffect(() => {
    if (activeCategory !== null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveScrollCategory(entry.target.id);
            const btn = document.getElementById(`tab-cat-${entry.target.id}`);
            if (btn) {
              btn.scrollIntoView({ inline: 'nearest', behavior: 'smooth' });
            }
            break;
          }
        }
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0.1 }
    );

    visibleCategories.forEach((cat) => {
      const el = document.getElementById(cat.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [visibleCategories, activeCategory]);

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
    <main className="min-h-screen bg-[#fcfbfa] text-stone-900 pb-28">
      {/* Header del Restaurante con identidad gastronómica sobria y cálida */}
      <header className="relative bg-[#1c1917] text-white overflow-hidden border-b border-stone-800">
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#d9480f] text-white flex items-center justify-center shadow-md ring-1 ring-white/10 shrink-0">
                <UtensilsCrossed className="w-7 h-7 sm:w-8 sm:h-8" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                    {local.name}
                  </h1>
                </div>
                <p className="text-xs sm:text-sm text-stone-400 mt-1 flex items-center gap-2">
                  {local.is_open !== false ? (
                    <>
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 motion-safe:animate-pulse" />
                      <span className="text-emerald-400 font-medium">
                        {local.is_catalog_only ? 'Abierto' : 'Abierto para pedidos'}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="inline-block w-2 h-2 rounded-full bg-rose-500" />
                      <span className="text-rose-400 font-semibold">Cerrado</span>
                    </>
                  )}
                  <span>·</span>
                  <Link href="/" className="text-[#f97316] hover:text-[#fb923c] transition-colors font-medium">
                    Cambiar sucursal
                  </Link>
                </p>
              </div>
            </div>

            {/* Badges de Información Legal e Higiene */}
            <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-white/90 text-xs font-medium backdrop-blur-xs">
                <ShieldCheck className="w-3.5 h-3.5 text-[#f97316]" />
                IVA incluido (16%)
              </span>
              {local.delivery_fee > 0 && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/10 text-white/90 text-xs font-medium">
                  Envío: {formatMXN(local.delivery_fee)}
                </span>
              )}
              {local?.reservations_enabled !== false && (
                <Link
                  href={`/${local.slug}/reservar`}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer border border-white/15"
                  title="Reservar una mesa en este restaurante"
                >
                  <Calendar className="w-3.5 h-3.5 text-orange-400" />
                  <span>Reservar Mesa</span>
                </Link>
              )}
              {!local?.is_catalog_only && (
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                  title="Ver carrito de compras"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Carrito</span>
                  {cartItemsCount > 0 && (
                    <span className="bg-white text-orange-600 font-extrabold text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                      {cartItemsCount}
                    </span>
                  )}
                </button>
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

      {/* Banner de Mesa QR Activa */}
      {mesaParam && (
        <div className={`py-3 px-4 shadow-sm border-b transition-all ${
          tableData?.qr_status === 'ABIERTO'
            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-blue-700'
            : 'bg-amber-500 text-white border-amber-600'
        }`}>
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs sm:text-sm">
            <div className="flex items-center gap-2 font-bold">
              <span className="p-1 rounded-lg bg-white/20">🍽️</span>
              <span>
                {tableData?.qr_status === 'ABIERTO'
                  ? `Ordenando en ${tableData?.table_number || mesaParam} · Comanda abierta`
                  : `Mesa ${tableData?.table_number || mesaParam} · En espera`}
              </span>
            </div>
            <span className="text-[11px] font-semibold bg-white/20 px-3 py-1 rounded-full w-fit">
              {tableData?.qr_status === 'ABIERTO'
                ? 'Tus pedidos van directo a cocina'
                : 'Pide a tu mesero que abra la mesa para pedir'}
            </span>
          </div>
        </div>
      )}


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

          {/* Carrusel de categorías con scroll-spy */}
          {visibleCategories.length > 1 && (
            <nav className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4 sm:mx-0 sm:px-0" aria-label="Categorías del menú">
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all select-none active:scale-95 cursor-pointer ${
                  activeCategory === null && activeScrollCategory === null
                    ? 'bg-orange-600 text-white shadow-sm shadow-orange-600/30'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900'
                }`}
              >
                Todos ({filteredProducts.length})
              </button>
              {visibleCategories.map((cat) => {
                const isSelected = activeCategory === cat.id || (activeCategory === null && activeScrollCategory === cat.id);
                return (
                  <button
                    key={cat.id}
                    id={`tab-cat-${cat.id}`}
                    type="button"
                    onClick={() => setActiveCategory(cat.id)}
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all select-none active:scale-95 cursor-pointer ${
                      isSelected
                        ? 'bg-orange-600 text-white shadow-sm shadow-orange-600/30'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900'
                    }`}
                  >
                    {cat.name} {cat.count !== undefined && <span className="opacity-75 text-[11px] ml-0.5">({cat.count})</span>}
                  </button>
                );
              })}
            </nav>
          )}

          {/* Fila de exclusión de alérgenos (CA-1.1) */}
          {allergens.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5 pb-0.5">
              <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider shrink-0 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-orange-500" /> Excluir:
              </span>
              {allergens.map((alg) => {
                const isExcluded = excludedAllergens.includes(alg);
                return (
                  <button
                    key={alg}
                    type="button"
                    onClick={() => {
                      setExcludedAllergens((prev) =>
                        prev.includes(alg) ? prev.filter((a) => a !== alg) : [...prev, alg]
                      );
                    }}
                    className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all select-none active:scale-95 flex items-center gap-1.5 cursor-pointer ${
                      isExcluded
                        ? 'bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs font-bold'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80 border border-transparent'
                    }`}
                    aria-pressed={isExcluded}
                  >
                    <span>{isExcluded ? '✓ Sin' : '+ Sin'} {alg}</span>
                  </button>
                );
              })}
              {excludedAllergens.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExcludedAllergens([])}
                  className="min-h-[36px] px-2 text-xs font-bold text-orange-600 hover:underline shrink-0 cursor-pointer"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          )}

          {/* Contador accesible de platillos */}
          <div className="flex items-center justify-between text-xs text-zinc-500 pt-0.5">
            <span className="font-semibold text-zinc-700">
              {filteredProducts.length} {filteredProducts.length === 1 ? 'platillo disponible' : 'platillos disponibles'}
            </span>
            {excludedAllergens.length > 0 && (
              <span className="text-amber-800 font-semibold text-[11px] bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200/70">
                Filtros: {excludedAllergens.map((a) => `Sin ${a}`).join(', ')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Lista de Productos por Categoría */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
        {filteredProducts.length === 0 ? (
          <div className="py-16 text-center" role="status" aria-live="polite">
            <div className="w-14 h-14 bg-zinc-100 text-zinc-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Search className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-zinc-800">No encontramos platillos con estos filtros</h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-xs mx-auto">
              {excludedAllergens.length > 0
                ? 'Prueba desactivando algún filtro de alérgenos o cambiando tu término de búsqueda.'
                : 'Intenta con otra palabra clave o revisa la ortografía de tu búsqueda.'}
            </p>
            {(search || excludedAllergens.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setExcludedAllergens([]);
                  setActiveCategory(null);
                }}
                className="mt-4 inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-xl shadow-sm cursor-pointer active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
              >
                Restablecer filtros y ver todo el menú
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
                              onClick={() => available && setModifierProduct(p)}
                              className={`w-full aspect-[4/3] object-cover rounded-xl border border-zinc-200/80 bg-zinc-100 mb-3 ${
                                available ? 'cursor-pointer hover:opacity-95 transition-opacity' : ''
                              }`}
                            />
                          )}

                          {/* Título y Estado */}
                          <div className="flex items-start justify-between gap-3 mb-1.5">
                            <h3 
                              onClick={() => available && setModifierProduct(p)}
                              className={`font-bold text-stone-900 text-base group-hover:text-[#d9480f] transition-colors ${
                                available ? 'cursor-pointer' : ''
                              }`}
                            >
                              {p.name}
                            </h3>
                            {!available && (
                              <span className="shrink-0 rounded-lg bg-stone-100 border border-stone-200 px-2.5 py-0.5 text-xs font-semibold text-stone-600">
                                Agotado por hoy
                              </span>
                            )}
                          </div>

                          {/* Descripción */}
                          {p.description && (
                            <p className="text-xs sm:text-sm text-stone-600 leading-relaxed line-clamp-2 max-w-prose">
                              {p.description}
                            </p>
                          )}

                          {/* Chips de alérgenos y dietas */}
                          <div className="flex flex-wrap gap-1.5 mt-2.5">
                            {p.diet_labels &&
                              p.diet_labels.map((diet) => (
                                <span
                                  key={diet}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-md border border-emerald-200/60"
                                >
                                  <Leaf className="w-3 h-3" />
                                  {diet}
                                </span>
                              ))}
                            {p.allergens &&
                              p.allergens.map((alg) => (
                                <span
                                  key={alg}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md border border-amber-200/60"
                                >
                                  <AlertTriangle className="w-3 h-3" />
                                  {alg}
                                </span>
                              ))}
                          </div>

                          {/* Enlace para personalizar o consultar opciones */}
                          {available && (
                            <button
                              type="button"
                              onClick={() => setModifierProduct(p)}
                              className="inline-flex items-center gap-1 text-xs text-[#d9480f] hover:text-[#b83807] font-semibold cursor-pointer mt-2.5 hover:underline"
                            >
                              <span>
                                {local?.is_catalog_only 
                                  ? 'Ver opciones e ingredientes' 
                                  : 'Personalizar ingredientes y notas'}
                              </span>
                            </button>
                          )}
                        </div>

                        {/* Pie de tarjeta: Precio y Controles */}
                        <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between gap-3">
                          <div>
                            <span className="text-xs text-zinc-400 block font-medium">Precio</span>
                            <span className="text-lg font-extrabold text-zinc-900">
                              {formatMXN(p.base_price)}
                            </span>
                          </div>

                          {local?.is_catalog_only ? (
                            <button
                              type="button"
                              onClick={() => setModifierProduct(p)}
                              className="px-3.5 py-2 rounded-xl text-xs font-bold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 hover:text-zinc-900 transition-colors cursor-pointer"
                            >
                              Ver detalles
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              {/* Stepper táctil ergonómico (≥ 44×44 px y foco accesible) */}
                              {available && (
                                <div className="flex items-center bg-zinc-100 rounded-xl p-0.5 border border-zinc-200">
                                  <button
                                    type="button"
                                    onClick={() => updateQuantity(p.id, -1)}
                                    disabled={qty <= 1}
                                    className="min-w-[44px] min-h-[44px] rounded-lg flex items-center justify-center text-zinc-600 hover:text-zinc-900 disabled:opacity-30 disabled:cursor-not-allowed active:bg-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
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
                                    className="min-w-[44px] min-h-[44px] rounded-lg flex items-center justify-center text-zinc-600 hover:text-zinc-900 active:bg-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
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
                          )}
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

      {/* Barra flotante inferior de Carrito estilo App (solo en modo pedidos) */}
      {!local?.is_catalog_only && cart.items.length > 0 && (
        <aside className="fixed bottom-4 inset-x-0 z-30 flex justify-center px-4 pointer-events-none pb-safe">
          <div
            className="pointer-events-auto w-full max-w-md bg-zinc-950 text-white rounded-2xl p-3 sm:p-3.5 shadow-2xl shadow-zinc-950/40 border border-white/10 flex items-center justify-between gap-3 hover:bg-zinc-900 transition-all"
          >
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex items-center gap-3 text-left hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer"
            >
              <div className="relative w-11 h-11 rounded-xl bg-orange-600 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-orange-600/30">
                <ShoppingBag className="w-5 h-5" />
                <span className="absolute -top-1 -right-1 bg-white text-zinc-900 text-[11px] font-extrabold w-5 h-5 rounded-full flex items-center justify-center shadow-xs">
                  {cartItemsCount}
                </span>
              </div>
              <div>
                <p className="text-xs text-zinc-400 font-medium">Ver mi pedido (editar / vaciar)</p>
                <p className="text-base font-extrabold text-white font-mono">{formatMXN(cartTotal)}</p>
              </div>
            </button>

            {(() => {
              const checkoutHref = mesaParam 
                ? `/${local.slug}/checkout?mesa=${encodeURIComponent(mesaParam)}${tokenParam ? `&token=${encodeURIComponent(tokenParam)}` : ''}`
                : `/${local.slug}/checkout`;

              return (
                <Link
                  href={checkoutHref}
                  className="inline-flex items-center gap-1.5 bg-orange-600 hover:bg-orange-500 text-white px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm tracking-wide transition-colors active:scale-95 shrink-0"
                >
                  <span>Checkout</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              );
            })()}
          </div>
        </aside>
      )}

      {/* Cart Drawer para ver/editar/vaciar pedido en el menú (solo en modo pedidos) */}
      {!local?.is_catalog_only && (
        <CartDrawer 
          slug={local.slug} 
          checkoutHref={mesaParam 
            ? `/${local.slug}/checkout?mesa=${encodeURIComponent(mesaParam)}${tokenParam ? `&token=${encodeURIComponent(tokenParam)}` : ''}`
            : undefined} 
        />
      )}

      {/* Selector Modal / Bottom-Sheet de Modificadores */}
      {modifierProduct && (
        <ModifierSelector
          product={modifierProduct}
          initialQuantity={quantities[modifierProduct.id] ?? 1}
          isAvailable={isProductAvailable(modifierProduct.id)}
          readOnly={Boolean(local?.is_catalog_only)}
          onConfirm={(modifiers, comments, qty) => {
            const finalQty = qty ?? quantities[modifierProduct.id] ?? 1;
            addItem(modifierProduct, finalQty, modifiers, comments);
            setModifierProduct(null);
          }}
          onCancel={() => setModifierProduct(null)}
        />
      )}
    </main>
  );
}

