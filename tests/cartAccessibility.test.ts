import { describe, it, expect } from 'vitest';
import {
  EMPTY_CART_COPY,
  EMPTY_SEARCH_COPY,
  ACCESSIBLE_FOCUS_RING_CLASSES,
  getCartLiveAnnouncement,
  FIRST_CATEGORY_SELECTORS,
} from '@/features/cart/cartAccessibility';
import fs from 'node:fs';
import path from 'node:path';

describe('FEATURE F-UI-02: Microcopy y Accesibilidad en Estados Vacíos y de Error', () => {
  describe('CA-1 – Estado vacío ilustrado con llamada a la acción', () => {
    it('proporciona los textos exactos requeridos para el estado vacío del carrito', () => {
      expect(EMPTY_CART_COPY.heading).toBe('Tu mesa aún está vacía');
      expect(EMPTY_CART_COPY.ctaText).toBe('Explorar los platillos más pedidos');
      expect(EMPTY_CART_COPY.description.length).toBeGreaterThan(15);
    });

    it('proporciona selectores de navegación accesibles para enfocar la primera categoría al cerrar el drawer', () => {
      expect(FIRST_CATEGORY_SELECTORS).toContain('nav[aria-label="Categorías del menú"] button');
      expect(FIRST_CATEGORY_SELECTORS).toContain('#todos');
      expect(FIRST_CATEGORY_SELECTORS).toContain('[data-category-first]');
    });

    it('el componente CartDrawer incluye el icono visual amigable UtensilsCrossed y la llamada a la acción', () => {
      const cartDrawerPath = path.resolve(__dirname, '../src/features/cart/CartDrawer.tsx');
      const cartDrawerSource = fs.readFileSync(cartDrawerPath, 'utf8');

      expect(cartDrawerSource).toContain('UtensilsCrossed');
      expect(cartDrawerSource).toContain('EMPTY_CART_COPY.heading');
      expect(cartDrawerSource).toContain('EMPTY_CART_COPY.ctaText');
      expect(cartDrawerSource).toContain('handleExploreTopDishes');
      expect(cartDrawerSource).toContain('data-testid="cart-empty-state"');
    });
  });

  describe('CA-2 – Cumplimiento WCAG 2.2 AA (Anillo de foco y aria-live="polite")', () => {
    it('define la clase obligatoria del anillo de foco visible (focus-visible:ring-2 focus-visible:ring-amber-500)', () => {
      expect(ACCESSIBLE_FOCUS_RING_CLASSES).toContain('focus-visible:ring-2');
      expect(ACCESSIBLE_FOCUS_RING_CLASSES).toContain('focus-visible:ring-amber-500');
    });

    it('todos los botones interactivos del CartDrawer implementan el anillo de foco accesible', () => {
      const cartDrawerPath = path.resolve(__dirname, '../src/features/cart/CartDrawer.tsx');
      const cartDrawerSource = fs.readFileSync(cartDrawerPath, 'utf8');

      // Comprobar que focus-visible:ring-amber-500 se utiliza consistentemente en botones
      const occurrences = (cartDrawerSource.match(/focus-visible:ring-amber-500/g) || []).length;
      expect(occurrences).toBeGreaterThanOrEqual(7);

      // Comprobar la presencia de la región aria-live="polite"
      expect(cartDrawerSource).toContain('aria-live="polite"');
      expect(cartDrawerSource).toContain('data-testid="cart-live-announcer"');
    });

    it('genera anuncios en vivo claros para lectores de pantalla ante adición, reducción y vaciado del carrito', () => {
      // Adición
      expect(getCartLiveAnnouncement(1, 0)).toBe('Se agregó un producto al carrito. Tienes 1 artículo.');
      expect(getCartLiveAnnouncement(3, 2)).toBe('Se agregó un producto al carrito. Tienes 3 artículos.');

      // Modificación / reducción
      expect(getCartLiveAnnouncement(2, 3)).toBe('Se actualizó el carrito. Tienes 2 artículos.');
      expect(getCartLiveAnnouncement(1, 2)).toBe('Se actualizó el carrito. Tienes 1 artículo.');

      // Vaciado total
      expect(getCartLiveAnnouncement(0, 2)).toBe('El carrito se ha vaciado.');

      // Sin cambios
      expect(getCartLiveAnnouncement(2, 2)).toBe('');
    });

    it('el estado vacío de búsqueda en MenuClient implementa aria-live="polite" y botón accesible', () => {
      const menuClientPath = path.resolve(__dirname, '../src/app/[location]/MenuClient.tsx');
      const menuClientSource = fs.readFileSync(menuClientPath, 'utf8');

      expect(menuClientSource).toContain('role="status" aria-live="polite"');
      expect(menuClientSource).toContain('focus-visible:ring-amber-500');
      expect(menuClientSource).toContain('min-h-[44px]');
    });
  });
});
