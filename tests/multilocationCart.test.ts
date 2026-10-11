import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('FEATURE F-03: Protección de Carrito en Navegación Multisede', () => {
  describe('CA-1 – Advertencia de vaciado por cambio de sede en LocationSwitcher', () => {
    it('el componente LocationSwitcher incluye el diálogo modal con el texto exacto requerido', () => {
      const switcherPath = path.resolve(__dirname, '../src/features/staff/LocationSwitcher.tsx');
      const source = fs.readFileSync(switcherPath, 'utf8');

      // Verificación de acceso al estado del carrito
      expect(source).toContain('useCart');
      expect(source).toContain('cart.items.length > 0');

      // Microcopy exacto según CA-1
      expect(source).toContain('Tienes productos agregados en');
      expect(source).toContain('tu carrito actual se vaciará. ¿Deseas continuar?');

      // Botón "Cambiar y vaciar"
      expect(source).toContain('Cambiar y vaciar');
      expect(source).toContain('clearCart');

      // Botón "Mantener en..."
      expect(source).toContain('Mantener en');
    });

    it('el diálogo modal cuenta con semántica accesible (role="dialog" y aria-modal="true")', () => {
      const switcherPath = path.resolve(__dirname, '../src/features/staff/LocationSwitcher.tsx');
      const source = fs.readFileSync(switcherPath, 'utf8');

      expect(source).toContain('role="dialog"');
      expect(source).toContain('aria-modal="true"');
      expect(source).toContain('aria-labelledby="location-modal-title"');
      expect(source).toContain('aria-describedby="location-modal-description"');
    });
  });

  describe('CA-2 – Cancelación de cambio (Botón Mantener en y tecla Escape)', () => {
    it('implementa listener de teclado para cancelar ante la tecla Escape', () => {
      const switcherPath = path.resolve(__dirname, '../src/features/staff/LocationSwitcher.tsx');
      const source = fs.readFileSync(switcherPath, 'utf8');

      expect(source).toContain("e.key === 'Escape'");
      expect(source).toContain('setIsModalOpen(false)');
      expect(source).toContain('setPendingTargetId(null)');
    });
  });

  describe('Integración con CartContext y Actions', () => {
    it('CartContext mantiene location_id y location_name y se limpian al ejecutar clearCart', () => {
      const cartPath = path.resolve(__dirname, '../src/features/cart/CartContext.tsx');
      const source = fs.readFileSync(cartPath, 'utf8');

      expect(source).toContain('location_id');
      expect(source).toContain('location_name');
      expect(source).toContain('clearCart');
      expect(source).toContain('location_id: null');
    });

    it('actions.ts createOrder valida y rechaza si el carrito pertenece a otra sucursal', () => {
      const actionsPath = path.resolve(__dirname, '../src/features/checkout/actions.ts');
      const source = fs.readFileSync(actionsPath, 'utf8');

      expect(source).toContain('input.cart.location_id && input.cart.location_id !== location_id');
      expect(source).toContain('Los productos en tu carrito pertenecen a otra sucursal');
    });
  });
});
