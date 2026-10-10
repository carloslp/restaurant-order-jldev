/**
 * Constantes y utilidades de microcopy y accesibilidad para el carrito y estados vacíos
 * según WCAG 2.2 AA (FEATURE F-UI-02).
 */

export const EMPTY_CART_COPY = {
  heading: 'Tu mesa aún está vacía',
  description: 'Aún no has agregado ningún platillo a tu comanda. Comienza descubriendo los favoritos de nuestra cocina.',
  ctaText: 'Explorar los platillos más pedidos',
} as const;

export const EMPTY_SEARCH_COPY = {
  heading: 'No encontramos resultados',
  description: 'Intenta con otra palabra clave o revisa la ortografía de tu búsqueda.',
  ctaText: 'Limpiar búsqueda y ver todo el menú',
} as const;

export const ACCESSIBLE_FOCUS_RING_CLASSES =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500';

/**
 * Retorna el texto del anuncio en vivo según el cambio en el número de artículos del carrito.
 */
export function getCartLiveAnnouncement(currentCount: number, prevCount: number): string {
  if (currentCount > prevCount) {
    return `Se agregó un producto al carrito. Tienes ${currentCount} ${currentCount === 1 ? 'artículo' : 'artículos'}.`;
  }
  if (currentCount < prevCount && currentCount > 0) {
    return `Se actualizó el carrito. Tienes ${currentCount} ${currentCount === 1 ? 'artículo' : 'artículos'}.`;
  }
  if (currentCount === 0 && prevCount > 0) {
    return 'El carrito se ha vaciado.';
  }
  return '';
}

/**
 * Selector de elementos objetivo para enfocar la primera categoría tras cerrar el Drawer
 */
export const FIRST_CATEGORY_SELECTORS =
  'nav[aria-label="Categorías del menú"] button, #todos, [data-category-first]';
