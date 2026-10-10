import { describe, it, expect } from 'vitest';
import {
  getElapsedMinutes,
  getKdsUrgencyLevel,
  getKdsCardVisuals,
  getKdsActionConfig,
} from '@/features/staff/kdsUtils';

describe('FEATURE F-03: Ergonomía Táctil y Modo Alta Demanda en Kitchen Display System (KDS)', () => {
  describe('CA-1 – Alerta visual por tiempo de espera', () => {
    it('calcula correctamente los minutos transcurridos a partir de una fecha ISO', () => {
      const now = new Date('2026-10-10T14:30:00Z').getTime();
      const created10MinAgo = new Date('2026-10-10T14:20:00Z').toISOString();
      const created26MinAgo = new Date('2026-10-10T14:04:00Z').toISOString();

      expect(getElapsedMinutes(created10MinAgo, now)).toBe(10);
      expect(getElapsedMinutes(created26MinAgo, now)).toBe(26);
    });

    it('en preparación: tiempo <= 15 min mantiene nivel normal con borde estándar', () => {
      const level = getKdsUrgencyLevel('EN_PREPARACION', 12);
      expect(level).toBe('normal');

      const visuals = getKdsCardVisuals('EN_PREPARACION', 12);
      expect(visuals.urgencyLevel).toBe('normal');
      expect(visuals.borderClass).toContain('border-gray-200');
      expect(visuals.pulseClass).toBe('');
      expect(visuals.staticIndicator).toBeNull();
    });

    it('en preparación: tiempo > 15 min cambia el borde a ámbar', () => {
      const level = getKdsUrgencyLevel('EN_PREPARACION', 16);
      expect(level).toBe('warning');

      const visuals = getKdsCardVisuals('EN_PREPARACION', 16);
      expect(visuals.urgencyLevel).toBe('warning');
      expect(visuals.borderClass).toContain('border-amber-500');
      expect(visuals.staticIndicator).toBe('⚠️ Demora (+15 min)');
      expect(visuals.pulseClass).toBe('');
    });

    it('en preparación: tiempo > 25 min pasa a rojo con pulso suave y soporte de prefers-reduced-motion', () => {
      const level = getKdsUrgencyLevel('EN_PREPARACION', 26);
      expect(level).toBe('urgent');

      const visuals = getKdsCardVisuals('EN_PREPARACION', 26);
      expect(visuals.urgencyLevel).toBe('urgent');
      expect(visuals.borderClass).toContain('border-red-500');
      // motion-safe:animate-pulse respeta prefers-reduced-motion
      expect(visuals.pulseClass).toContain('motion-safe:animate-pulse');
      // Indicador estático de urgencia presente para accesibilidad
      expect(visuals.staticIndicator).toBe('🚨 Urgente (+25 min)');
    });

    it('otros estados (ej. CONFIRMADO_CAJA o LISTO) no activan la alerta de en preparación', () => {
      expect(getKdsUrgencyLevel('CONFIRMADO_CAJA', 30)).toBe('normal');
      expect(getKdsUrgencyLevel('LISTO', 40)).toBe('normal');
    });
  });

  describe('CA-2 – Botón de avance táctil grande (ancho completo y min-h 56px)', () => {
    it('comanda en CONFIRMADO_CAJA: genera acción para EN_PREPARACION', () => {
      const config = getKdsActionConfig('CONFIRMADO_CAJA', 'DOMICILIO');
      expect(config).not.toBeNull();
      expect(config?.nextStatus).toBe('EN_PREPARACION');
      expect(config?.actionLabel).toContain('Comenzar Preparación');
    });

    it('comanda en EN_PREPARACION: genera acción para avanzar a LISTO', () => {
      const config = getKdsActionConfig('EN_PREPARACION', 'RECOGER');
      expect(config).not.toBeNull();
      expect(config?.nextStatus).toBe('LISTO');
      expect(config?.actionLabel).toContain('Marcar Listo');
    });

    it('comanda en LISTO con orden EN_MESA: genera acción para COMPLETADO (servido en mesa)', () => {
      const config = getKdsActionConfig('LISTO', 'EN_MESA');
      expect(config).not.toBeNull();
      expect(config?.nextStatus).toBe('COMPLETADO');
      expect(config?.actionLabel).toContain('Servido en Mesa');
    });

    it('comanda en LISTO para llevar o delivery: no tiene botón de avance en cocina (se despacha en caja)', () => {
      const config = getKdsActionConfig('LISTO', 'DOMICILIO');
      expect(config).toBeNull();
    });
  });
});
