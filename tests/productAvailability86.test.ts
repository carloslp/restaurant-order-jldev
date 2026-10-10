import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createOrder } from '@/features/checkout/actions';
import type { CreateOrderInput } from '@/features/checkout/actions';
import type { Cart } from '@/lib/types';

describe('FEATURE: Disponibilidad de Menú en Tiempo Real ("86" Platillos Agotados)', () => {
  describe('CA-1 – Marcar producto como agotado desde KDS / Caja & CA-8 Ergonomía táctil', () => {
    it('el componente ProductAvailabilityManager define área táctil >= 44x44 px y acciones para alternar 86 / Reactivar', () => {
      const filePath = path.resolve(__dirname, '../src/features/staff/ProductAvailabilityManager.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // Botón táctil ergonómico con min-height >= 44px
      expect(content).toContain('min-h-[44px]');
      // Microcopy de 86 y Reactivar
      expect(content).toContain('Marcar 86 (Agotado)');
      expect(content).toContain('Reactivar');
      expect(content).toContain('toggleProductAvailability');
      // Manejo de estado optimista y rollback ante fallo (CA-5)
      expect(content).toContain('previousProducts');
    });

    it('KitchenDisplay integra el botón y modal de disponibilidad rápida', () => {
      const filePath = path.resolve(__dirname, '../src/features/staff/KitchenDisplay.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).toContain('ProductAvailabilityManager');
      expect(content).toContain('Agotados (86) / Menú');
      expect(content).toContain('min-h-[44px]');
    });

    it('CashierView integra el botón y modal de disponibilidad rápida', () => {
      const filePath = path.resolve(__dirname, '../src/features/staff/CashierView.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).toContain('ProductAvailabilityManager');
      expect(content).toContain('Agotados (86) / Menú');
      expect(content).toContain('min-h-[44px]');
    });
  });

  describe('CA-2 – Reflejo instantáneo en el menú público (Cliente) y AddToCartButton', () => {
    it('MenuClient y useProductAvailability suscriben a Realtime postgres_changes de products', () => {
      const hookPath = path.resolve(__dirname, '../src/features/menu/useProductAvailability.ts');
      const hookContent = fs.readFileSync(hookPath, 'utf8');

      expect(hookContent).toContain("table: 'products'");
      expect(hookContent).toContain('postgres_changes');
      expect(hookContent).toContain('is_available');
    });

    it('MenuClient muestra la etiqueta visual "Agotado" y deshabilita AddToCartButton cuando is_available es false', () => {
      const menuClientPath = path.resolve(__dirname, '../src/app/[location]/MenuClient.tsx');
      const menuContent = fs.readFileSync(menuClientPath, 'utf8');

      expect(menuContent).toContain('Agotado');
      expect(menuContent).toContain('disabled={!available}');
    });

    it('AddToCartButton se renderiza deshabilitado con el texto "Agotado" cuando disabled=true', () => {
      const btnPath = path.resolve(__dirname, '../src/app/[location]/AddToCartButton.tsx');
      const btnContent = fs.readFileSync(btnPath, 'utf8');

      expect(btnContent).toContain("'Agotado'");
      expect(btnContent).toContain('disabled');
      expect(btnContent).toContain('cursor-not-allowed');
    });
  });

  describe('CA-4 – Carrito con ítem agotado durante el checkout (Validación y rechazo del servidor)', () => {
    it('actions.ts createOrder valida y rechaza si un platillo en el carrito se marcó como agotado con mensaje explicativo', () => {
      const actionsPath = path.resolve(__dirname, '../src/features/checkout/actions.ts');
      const actionsContent = fs.readFileSync(actionsPath, 'utf8');

      // Debe validar product.is_available y solicitar removerlo/reemplazarlo
      expect(actionsContent).toContain('!product.is_available');
      expect(actionsContent).toContain('se ha agotado');
      expect(actionsContent).toContain('remuévelo o reemplázalo');
    });
  });

  describe('CA-5 – Falla de conexión o sesión expirada (Rollback optimista y alerta)', () => {
    it('ProductAvailabilityManager alerta con "No se pudo actualizar el estado del platillo" y revierte el cambio', () => {
      const compPath = path.resolve(__dirname, '../src/features/staff/ProductAvailabilityManager.tsx');
      const compContent = fs.readFileSync(compPath, 'utf8');

      expect(compContent).toContain('No se pudo actualizar el estado del platillo');
      expect(compContent).toContain('role="alert"');
      expect(compContent).toContain('aria-live="assertive"');
    });
  });

  describe('CA-7 – Concurrencia y RLS', () => {
    it('toggleProductAvailability aplica seguridad por location_id y set_config', () => {
      const menuPath = path.resolve(__dirname, '../src/lib/server/menu.ts');
      const menuContent = fs.readFileSync(menuPath, 'utf8');

      expect(menuContent).toContain('export async function toggleProductAvailability');
      expect(menuContent).toContain("eq('location_id', staff.location_id)");
      expect(menuContent).toContain("revalidatePath(`/${local.slug}`)");
    });
  });
});
