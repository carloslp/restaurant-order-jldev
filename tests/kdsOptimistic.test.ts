import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('FEATURE: Respuesta Inmediata y Actualizaciones Optimistas en KDS y Caja', () => {
  describe('useRealtimeOrders helper optimista', () => {
    it('define mutateOrderStatusOptimistic con rollback', () => {
      const hookPath = path.resolve(__dirname, '../src/features/staff/useRealtimeOrders.ts');
      const content = fs.readFileSync(hookPath, 'utf8');

      expect(content).toContain('mutateOrderStatusOptimistic');
      expect(content).toContain('previousOrder');
      expect(content).toContain('Object.assign(orders, {');
      expect(content).toContain('mutateOrderStatusOptimistic,');
    });
  });

  describe('KitchenDisplay integración optimista (0 ms)', () => {
    it('KitchenDisplay ejecuta mutateOrderStatusOptimistic antes de la llamada remota y revierte en error', () => {
      const kdsPath = path.resolve(__dirname, '../src/features/staff/KitchenDisplay.tsx');
      const content = fs.readFileSync(kdsPath, 'utf8');

      expect(content).toContain('orders.mutateOrderStatusOptimistic?.(orderId, nextStatus)');
      expect(content).toContain('rollback?.()');
      expect(content).toContain('animate-in fade-in zoom-in-95 duration-200');
    });
  });

  describe('CashierView integración optimista', () => {
    it('CashierView aplica mutación optimista al avanzar órdenes y revierte en error', () => {
      const cashierPath = path.resolve(__dirname, '../src/features/staff/CashierView.tsx');
      const content = fs.readFileSync(cashierPath, 'utf8');

      expect(content).toContain('orders.mutateOrderStatusOptimistic?.(orderId, nextStatus)');
      expect(content).toContain('rollback?.()');
    });
  });
});
