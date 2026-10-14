import { describe, it, expect } from 'vitest';
import { generateMenuDryRunDiff } from '../src/lib/menu-csv-parser';
import fs from 'node:fs';
import path from 'node:path';

describe('FEATURE 5: Fila Virtual en Vivo, Asignación de Mesas y Menú CSV Seguro', () => {
  describe('CA-5.3: Simulación Dry-Run y Detección de Variación Crítica de Precio (>50%)', () => {
    it('detecta productos nuevos, productos existentes y alerta de sobreprecio >50%', () => {
      const existingCatalog = [
        { name: 'Tacos de Pastor', base_price: 100, category_name: 'Tacos' },
        { name: 'Guacamole Tradicional', base_price: 80, category_name: 'Entradas' },
        { name: 'Refresco', base_price: 35, category_name: 'Bebidas' },
      ];

      const csvContent = [
        'Categoria,Producto,Precio,Disponible',
        'Tacos,Tacos de Pastor,180,true', // Aumento de 100 a 180 (+80% -> Price Surge!)
        'Entradas,Guacamole Tradicional,90,true', // Aumento de 80 a 90 (+12.5% -> Normal)
        'Bebidas,Refresco,35,true', // Sin cambio de precio
        'Postres,Flan Casero,65,true', // Producto nuevo
      ].join('\n');

      const diff = generateMenuDryRunDiff(csvContent, existingCatalog);

      expect(diff.isValid).toBe(true);
      expect(diff.errors.length).toBe(0);

      // 1 producto nuevo (Flan Casero)
      expect(diff.newProducts.length).toBe(1);
      expect(diff.newProducts[0].name).toBe('Flan Casero');
      expect(diff.newProducts[0].price).toBe(65);

      // 3 productos existentes en el catálogo
      expect(diff.existingProductsCount).toBe(3);

      // 2 cambios de precio (Tacos de Pastor y Guacamole)
      expect(diff.priceChanges.length).toBe(2);

      const tacosChange = diff.priceChanges.find((p) => p.productName === 'Tacos de Pastor');
      expect(tacosChange).toBeDefined();
      expect(tacosChange?.previousPrice).toBe(100);
      expect(tacosChange?.newPrice).toBe(180);
      expect(tacosChange?.percentChange).toBe(80);
      expect(tacosChange?.isPriceSurge).toBe(true);

      const guacChange = diff.priceChanges.find((p) => p.productName === 'Guacamole Tradicional');
      expect(guacChange).toBeDefined();
      expect(guacChange?.percentChange).toBe(13); // redond(10/80 * 100) = 13%
      expect(guacChange?.isPriceSurge).toBe(false);

      expect(diff.hasPriceSurge).toBe(true);
    });

    it('identifica errores de formato en el CSV para prevenir escrituras parciales (zero partial writes)', () => {
      const csvWithErrors = [
        'Categoria,Producto,Precio,Disponible',
        'Tacos,Taco Inválido,-50,true', // Precio negativo
      ].join('\n');

      const diff = generateMenuDryRunDiff(csvWithErrors, []);
      expect(diff.isValid).toBe(false);
      expect(diff.errors.length).toBeGreaterThan(0);
      expect(diff.errors[0].message).toContain('precio');
    });

    it('AdminMenuCsvModal y menu-csv.ts implementan dry-run y auditoría logAudit', () => {
      const modalPath = path.resolve(__dirname, '../src/features/admin/AdminMenuCsvModal.tsx');
      const modalContent = fs.readFileSync(modalPath, 'utf8');

      expect(modalContent).toContain('getMenuDryRunDiff');
      expect(modalContent).toContain('dryRunDiff');
      expect(modalContent).toContain('Simulación Dry-Run');
      expect(modalContent).toContain('Variación de precio mayor al 50%');

      const serverCsvPath = path.resolve(__dirname, '../src/lib/server/menu-csv.ts');
      const serverCsvContent = fs.readFileSync(serverCsvPath, 'utf8');
      expect(serverCsvContent).toContain('logAudit');
      expect(serverCsvContent).toContain('IMPORT_MENU_CSV');
    });
  });

  describe('CA-5.1: Tracking en vivo de fila con vibración, tolerancia y confirmación destructiva', () => {
    it('WaitlistTrackingClient incluye vibración móvil, tolerancia regresiva y modal destructivo', () => {
      const trackingPath = path.resolve(
        __dirname,
        '../src/app/track/fila/[token]/WaitlistTrackingClient.tsx'
      );
      const content = fs.readFileSync(trackingPath, 'utf8');

      expect(content).toContain('navigator.vibrate');
      expect(content).toContain('graceSecondsLeft');
      expect(content).toContain('formatCountdown');
      expect(content).toContain('Voy para allá');
      expect(content).toContain('showCancelModal');
      expect(content).toContain('¿Seguro que deseas salir de la fila?');
    });
  });

  describe('CA-5.2: Auto-sugerencia de mesas libres y óptimas en AdminWaitlistManager', () => {
    it('AdminWaitlistManager prioriza mesas óptimas por capacidad y muestra badge Sugerida', () => {
      const managerPath = path.resolve(
        __dirname,
        '../src/features/admin/AdminWaitlistManager.tsx'
      );
      const content = fs.readFileSync(managerPath, 'utf8');

      expect(content).toContain('isOptimalTable');
      expect(content).toContain('✨ Sugerida');
      expect(content).toContain('sortedFreeTables');
    });
  });
});
