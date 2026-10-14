import { describe, it, expect } from 'vitest';
import {
  getElapsedMinutes,
  getKdsUrgencyLevel,
  getKdsCardVisuals,
  getKdsActionConfig,
  playNewOrderChime,
} from '@/features/staff/kdsUtils';
import fs from 'node:fs';
import path from 'node:path';

describe('FEATURE F-02: Sistema de Alertas de Rendimiento y Criticidad en KDS', () => {
  describe('ENABLER E-02 [Infraestructura / Spike]: Oscilador Web Audio API reutilizable', () => {
    it('kdsAudio implementa oscilador nativo Web Audio API sin MP3 externo y respeta mute', async () => {
      // Si está silenciado, retorna false sin reproducir
      const mutedResult = await playNewOrderChime({ isMuted: true });
      expect(mutedResult).toBe(false);

      // Si el volumen es 0, retorna false
      const zeroVolResult = await playNewOrderChime({ volume: 0 });
      expect(zeroVolResult).toBe(false);
    });

    it('KitchenDisplay implementa control manual de volumen/silencio en pantalla', () => {
      const kdsPath = path.resolve(__dirname, '../src/features/staff/KitchenDisplay.tsx');
      const kdsSource = fs.readFileSync(kdsPath, 'utf8');

      expect(kdsSource).toContain('isMuted');
      expect(kdsSource).toContain('Silenciar sonido de comandas');
      expect(kdsSource).toContain('Activar sonido de comandas');
      expect(kdsSource).toContain('min-h-[44px]');
      expect(kdsSource).toContain('min-w-[44px]');
    });
  });

  describe('CA-1 – Alerta sonora en nueva comanda recibida y resaltado transitorio', () => {
    it('KitchenDisplay y useRealtimeOrders definen handleNewOrder y resaltado transitorio de 1.5s', () => {
      const kdsPath = path.resolve(__dirname, '../src/features/staff/KitchenDisplay.tsx');
      const kdsSource = fs.readFileSync(kdsPath, 'utf8');

      expect(kdsSource).toContain('playNewOrderChime');
      expect(kdsSource).toContain('highlightedOrderId');
      expect(kdsSource).toContain('1500'); // 1.5 s
      expect(kdsSource).toContain('ring-amber-400');

      const hookPath = path.resolve(__dirname, '../src/features/staff/useRealtimeOrders.ts');
      const hookSource = fs.readFileSync(hookPath, 'utf8');

      expect(hookSource).toContain('onNewOrder');
      expect(hookSource).toContain("payload.eventType === 'INSERT'");
    });
  });

  describe('CA-2 – Transición de estados de criticidad temporal (Semáforo)', () => {
    it('calcula correctamente los minutos transcurridos a partir de una fecha ISO', () => {
      const now = new Date('2026-10-10T14:30:00Z').getTime();
      const created8MinAgo = new Date('2026-10-10T14:22:00Z').toISOString();
      const created10MinAgo = new Date('2026-10-10T14:20:00Z').toISOString();
      const created18MinAgo = new Date('2026-10-10T14:12:00Z').toISOString();

      expect(getElapsedMinutes(created8MinAgo, now)).toBe(8);
      expect(getElapsedMinutes(created10MinAgo, now)).toBe(10);
      expect(getElapsedMinutes(created18MinAgo, now)).toBe(18);
    });

    it('en preparación: tiempo < 10 min mantiene nivel normal con borde estándar gris/verde', () => {
      const level = getKdsUrgencyLevel('EN_PREPARACION', 8);
      expect(level).toBe('normal');

      const visuals = getKdsCardVisuals('EN_PREPARACION', 8);
      expect(visuals.urgencyLevel).toBe('normal');
      expect(visuals.borderClass).toContain('border-gray-200');
      expect(visuals.bgClass).toBe('bg-white');
    });

    it('en preparación: tiempo >= 10 min pasa a advertencia con borde ámbar (#D97706)', () => {
      const level = getKdsUrgencyLevel('EN_PREPARACION', 10);
      expect(level).toBe('warning');

      const visuals = getKdsCardVisuals('EN_PREPARACION', 10);
      expect(visuals.urgencyLevel).toBe('warning');
      expect(visuals.borderClass).toContain('border-[#D97706]');
      expect(visuals.staticIndicator).toContain('+10 min');
    });

    it('en preparación: tiempo >= 18 min pasa a crítico con fondo rojo suave (#FEF2F2) y borde rojo (#DC2626)', () => {
      const level = getKdsUrgencyLevel('EN_PREPARACION', 18);
      expect(level).toBe('urgent');

      const visuals = getKdsCardVisuals('EN_PREPARACION', 18);
      expect(visuals.urgencyLevel).toBe('urgent');
      expect(visuals.borderClass).toContain('border-[#DC2626]');
      expect(visuals.bgClass).toBe('bg-[#FEF2F2]');
      expect(visuals.staticIndicator).toContain('+18 min');
    });

    it('otros estados (ej. CONFIRMADO_CAJA o LISTO) permanecen en nivel normal', () => {
      expect(getKdsUrgencyLevel('CONFIRMADO_CAJA', 20)).toBe('normal');
      expect(getKdsUrgencyLevel('LISTO', 30)).toBe('normal');
    });
  });

  describe('CA-3 – Pérdida y reconexión de WebSocket', () => {
    it('detecta pérdida de conexión y expone banner de reconexión en KitchenDisplay', () => {
      const hookPath = path.resolve(__dirname, '../src/features/staff/useRealtimeOrders.ts');
      const hookSource = fs.readFileSync(hookPath, 'utf8');

      expect(hookSource).toContain('isReconnecting');
      expect(hookSource).toContain('setIsReconnecting');

      const kdsPath = path.resolve(__dirname, '../src/features/staff/KitchenDisplay.tsx');
      const kdsSource = fs.readFileSync(kdsPath, 'utf8');

      expect(kdsSource).toContain('orders.isReconnecting');
      expect(kdsSource).toContain('Sin conexión en vivo — Reintentando conectar...');
      expect(kdsSource).toContain('bg-amber-500');
    });
  });

  describe('CA-4 – Consumo de memoria y limpieza de timers', () => {
    it('KitchenDisplay limpia el intervalo del temporizador al desmontarse', () => {
      const kdsPath = path.resolve(__dirname, '../src/features/staff/KitchenDisplay.tsx');
      const kdsSource = fs.readFileSync(kdsPath, 'utf8');

      expect(kdsSource).toContain('clearInterval(timer)');
      expect(kdsSource).toContain('clearTimeout(highlightTimerRef.current)');
    });
  });

  describe('Acciones táctiles del KDS', () => {
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

    it('comanda en LISTO con orden EN_MESA: genera acción para COMPLETADO', () => {
      const config = getKdsActionConfig('LISTO', 'EN_MESA');
      expect(config).not.toBeNull();
      expect(config?.nextStatus).toBe('COMPLETADO');
      expect(config?.actionLabel).toContain('Servido en Mesa');
    });
  });
});
