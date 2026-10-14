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
  addItem: (
    product: Product,
    quantity?: number,
    modifiers?: CartItemModifiers[],
    comments?: string,
    locationName?: string
  ) => void;
  updateQuantity: (key: string, quantity: number) => void;
  updateComments: (key: string, comments: string) => void;
  removeItem: (key: string) => void;
  restoreItem: (item: CartItem) => void;
  clearCart: () => void;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  locationId?: string | null;
  locationName?: string | null;
  setLocation: (locationId: string | null, locationName?: string | null) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

/** Clave estable por producto + modificadores + comentario (para tratar ítems con distintas observaciones como líneas separadas). */
export function itemKey(item: CartItem): string {
  return JSON.stringify([
    item.product_id,
    item.modifiers.map((m) => [m.modifier_group_id, m.selections.map((s) => s.option_id)]),
    item.comments?.trim() || '',
  ]);
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart>({ items: [], location_id: null, location_name: null });
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
          : { items: [], location_id: null, location_name: null }
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
    (product, quantity = 1, modifiers = [], comments = '', locationName = '') => {
      const newItem: CartItem = {
        product_id: product.id,
        product_name: product.name,
        base_price: product.base_price,
        quantity: Math.max(1, Math.floor(quantity)),
        modifiers: modifiers as CartItemModifiers[],
        comments: comments?.trim() || undefined,
      };
      setCart((prev) => {
        const key = itemKey(newItem);
        const idx = prev.items.findIndex((i) => itemKey(i) === key);
        const nextLocId = prev.location_id || product.location_id || null;
        const nextLocName = prev.location_name || locationName || null;

        if (idx >= 0) {
          const nextItems = [...prev.items];
          nextItems[idx] = {
            ...nextItems[idx],
            quantity: nextItems[idx].quantity + newItem.quantity,
          };
          return { items: nextItems, location_id: nextLocId, location_name: nextLocName };
        }
        return { items: [...prev.items, newItem], location_id: nextLocId, location_name: nextLocName };
      });
      // No abrimos el drawer automáticamente para no incomodar en móvil/tablet.
      // El usuario puede abrirlo cuando quiera desde la barra inferior flotante.
    },
    []
  );

  const updateQuantity = useCallback<CartContextValue['updateQuantity']>((key, quantity) => {
    setCart((prev) => {
      const items = prev.items
        .map((item) => (itemKey(item) === key ? { ...item, quantity } : item))
        .filter((item) => item.quantity > 0);
      return {
        ...prev,
        items,
        location_id: items.length === 0 ? null : prev.location_id,
        location_name: items.length === 0 ? null : prev.location_name,
      };
    });
  }, []);

  const updateComments = useCallback<CartContextValue['updateComments']>((key, comments) => {
    setCart((prev) => {
      const trimmed = comments.trim() || undefined;
      const targetItem = prev.items.find((i) => itemKey(i) === key);
      if (!targetItem) return prev;

      const updatedItem = { ...targetItem, comments: trimmed };
      const newKey = itemKey(updatedItem);

      const otherItems = prev.items.filter((i) => itemKey(i) !== key);
      const existingSameIdx = otherItems.findIndex((i) => itemKey(i) === newKey);
      if (existingSameIdx >= 0) {
        otherItems[existingSameIdx] = {
          ...otherItems[existingSameIdx],
          quantity: otherItems[existingSameIdx].quantity + updatedItem.quantity,
        };
        return { ...prev, items: otherItems };
      }
      return { ...prev, items: [...otherItems, updatedItem] };
    });
  }, []);

  const removeItem = useCallback<CartContextValue['removeItem']>((key) => {
    setCart((prev) => {
      const items = prev.items.filter((item) => itemKey(item) !== key);
      return {
        ...prev,
        items,
        location_id: items.length === 0 ? null : prev.location_id,
        location_name: items.length === 0 ? null : prev.location_name,
      };
    });
  }, []);

  const restoreItem = useCallback<CartContextValue['restoreItem']>((item) => {
    setCart((prev) => {
      const key = itemKey(item);
      const exists = prev.items.some((i) => itemKey(i) === key);
      if (exists) return prev;
      return {
        ...prev,
        items: [...prev.items, item],
      };
    });
  }, []);

  const clearCart = useCallback(() => {
    try {
      localStorage.removeItem(CART_STORAGE_KEY);
      localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify({ items: [], location_id: null, location_name: null })
      );
    } catch {
      // ignore
    }
    setCart({ items: [], location_id: null, location_name: null });
  }, []);

  const setLocation = useCallback((locationId: string | null, locationName?: string | null) => {
    setCart((prev) => ({
      ...prev,
      location_id: locationId,
      location_name: locationName !== undefined ? locationName : prev.location_name,
    }));
  }, []);

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
    () => ({
      cart,
      count,
      total,
      addItem,
      updateQuantity,
      updateComments,
      removeItem,
      restoreItem,
      clearCart,
      isOpen,
      setOpen,
      locationId: cart.location_id ?? null,
      locationName: cart.location_name ?? null,
      setLocation,
    }),
    [cart, count, total, addItem, updateQuantity, updateComments, removeItem, restoreItem, clearCart, isOpen, setLocation]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart debe usarse dentro de <CartProvider>');
  return ctx;
}