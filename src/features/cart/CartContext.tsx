// Carrito compartido del cliente: estado, persistencia en localStorage,
// cálculo de líneas con modificadores, y total con IVA incluido.

'use client';

import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import type { Cart, CartItem, Product, CartItemModifiers } from '@/lib/types';
import { linePrice } from '@/lib/pricing';

const CART_STORAGE_KEY = 'restaurant-order-jldev:cart';

interface CartContextValue {
  cart: Cart;
  count: number;
  total: number;
  addItem: (product: Product, quantity?: number, modifiers?: CartItemModifiers[]) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clearCart: () => void;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

/** Clave estable por producto + modificadores (para combinar líneas iguales). */
function itemKey(item: CartItem): string {
  return JSON.stringify([
    item.product_id,
    item.modifiers.map((m) => [m.modifier_group_id, m.selections.map((s) => s.option_id)]),
  ]);
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart>({ items: [] });
  const [isOpen, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // 1. Hidratar desde localStorage (solo cliente, evitar mismatch SSR)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Cart) : null;
      setCart(
        parsed && Array.isArray(parsed.items)
          ? parsed
          : { items: [] }
      );
    } catch {
      // carrito corrupto → empezar vacío
    }
    setHydrated(true);
  }, []);

  // 2. Persistir
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // storage lleno o bloqueado
    }
  }, [cart, hydrated]);

  const addItem = useCallback<CartContextValue['addItem']>(
    (product, quantity = 1, modifiers = []) => {
      const newItem: CartItem = {
        product_id: product.id,
        product_name: product.name,
        base_price: product.base_price,
        quantity: Math.max(1, Math.floor(quantity)),
        modifiers: modifiers as CartItemModifiers[],
      };
      setCart((prev) => {
        const key = itemKey(newItem);
        const idx = prev.items.findIndex((i) => itemKey(i) === key);
        if (idx >= 0) {
          const nextItems = [...prev.items];
          nextItems[idx] = {
            ...nextItems[idx],
            quantity: nextItems[idx].quantity + newItem.quantity,
            // Note: we are not merging modifiers here; we assume the same modifiers.
            // If we want to merge modifiers, we would need to compare them.
            // For simplicity, we keep the existing modifiers of the existing item.
          };
          return { items: nextItems };
        }
        return { items: [...prev.items, newItem] };
      });
      setOpen(true);
    },
    []
  );

  const updateQuantity = useCallback<CartContextValue['updateQuantity']>((key, quantity) => {
    setCart((prev) => {
      const items = prev.items
        .map((item) => (itemKey(item) === key ? { ...item, quantity } : item))
        .filter((item) => item.quantity > 0);
      return { items };
    });
  }, []);

  const removeItem = useCallback<CartContextValue['removeItem']>((key) => {
    setCart((prev) => ({
      items: prev.items.filter((item) => itemKey(item) !== key),
    }));
  }, []);

  const clearCart = useCallback(() => setCart({ items: [] }), []);

  const { count, total } = useMemo(() => {
    let count = 0;
    let total = 0;
    for (const item of cart.items) {
      count += item.quantity;
      // Flatten modifiers for linePrice: we need array of {price_impact, quantity}
      const flatMods = item.modifiers.flatMap((m) =>
        m.selections.map((s) => ({
          price_impact: s.price_impact,
          quantity: s.quantity,
        }))
      );
      total += linePrice({
        base_price: item.base_price,
        quantity: item.quantity,
        modifiers: flatMods,
      });
    }
    return { count, total };
  }, [cart]);

  const value = useMemo(
    () => ({ cart, count, total, addItem, updateQuantity, removeItem, clearCart, isOpen, setOpen }),
    [cart, count, total, addItem, updateQuantity, removeItem, clearCart, isOpen]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart debe usarse dentro de <CartProvider>');
  return ctx;
}