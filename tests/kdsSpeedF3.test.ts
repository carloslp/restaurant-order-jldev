import { describe, it, expect } from 'vitest';
import { getKdsCardVisuals } from '../src/features/staff/kdsUtils';
import fs from 'node:fs';
import path from 'node:path';

describe('FEATURE 3: Velocidad y Control en KDS y Caja', () => {
  describe('CA-3.1: Ventana de Deshacer (Undo) en KitchenDisplay', () => {
    it('KitchenDisplay implementa barra de gracia de 4 segundos con botón Deshacer y cola pendingCommitsRef', () => {
      const kdsPath = path.resolve(__dirname, '../src/features/staff/KitchenDisplay.tsx');
      const content = fs.readFileSync(kdsPath, 'utf8');

      expect(content).toContain('activeUndo');
      expect(content).toContain('activeUndo.rollback()');
      expect(content).toContain('Deshacer');
      expect(content).toContain('4000');
      expect(content).toContain('mutateOrderStatusOptimistic');
      expect(content).toContain('pendingCommitsRef');
      expect(content).toContain('prevPending.commit()');
    });
  });

  describe('CA-3.2: Alerta visual accesible y jerarquía de SLA sin depender únicamente del color', () => {
    it('evalúa correctamente los rangos de SLA (<10m, 10-18m, >=18m) con labels textuales claros', () => {
      // Menos de 10 minutos
      const onTime = getKdsCardVisuals('EN_PREPARACION', 5);
      expect(onTime.urgencyLevel).toBe('normal');
      expect(onTime.staticIndicator).toBe('✅ A tiempo');
      expect(onTime.borderClass).toContain('border-gray-200');

      // Entre 10 y 18 minutos (alerta intermedia con borde dashed)
      const warning = getKdsCardVisuals('EN_PREPARACION', 12);
      expect(warning.urgencyLevel).toBe('warning');
      expect(warning.staticIndicator).toBe('⏱️ Demora (+10 min)');
      expect(warning.borderClass).toContain('border-dashed');
      expect(warning.borderClass).toContain('border-[#D97706]');

      // Más de 18 minutos (urgente con pulso y borde rojo)
      const urgent = getKdsCardVisuals('EN_PREPARACION', 20);
      expect(urgent.urgencyLevel).toBe('urgent');
      expect(urgent.staticIndicator).toBe('🚨 Urgente (+18 min)');
      expect(urgent.borderClass).toContain('border-[#DC2626]');
      expect(urgent.pulseClass).toContain('animate-pulse');
    });

    it('KitchenDisplay incluye banner de estado de conexión en vivo y tono de alerta', () => {
      const kdsPath = path.resolve(__dirname, '../src/features/staff/KitchenDisplay.tsx');
      const content = fs.readFileSync(kdsPath, 'utf8');

      expect(content).toContain('Sin conexión en vivo — Reintentando conectar...');
      expect(content).toContain('playAlertTone');
    });
  });

  describe('CA-3.3: Acceso rápido y atajo Alt+8 para gestión de Agotados (86)', () => {
    it('StaffNav incluye botón Agotados (86), atajo Alt+8 y ProductAvailabilityManager', () => {
      const staffNavPath = path.resolve(__dirname, '../src/features/staff/StaffNav.tsx');
      const content = fs.readFileSync(staffNavPath, 'utf8');

      expect(content).toContain('Agotados (86)');
      expect(content).toContain('altKey');
      expect(content).toContain('ProductAvailabilityManager');
    });

    it('ProductAvailabilityManager enfoca automáticamente el buscador con autoFocus', () => {
      const pamPath = path.resolve(__dirname, '../src/features/staff/ProductAvailabilityManager.tsx');
      const content = fs.readFileSync(pamPath, 'utf8');

      expect(content).toContain('autoFocus');
      expect(content).toContain('placeholder="Buscar platillo por nombre..."');
    });
  });
});
