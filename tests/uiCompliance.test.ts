import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Cumplimiento de UI / Accesibilidad WCAG 2.2 AA (Fase 1)', () => {
  it('no contiene clases inválidas py-0.2 en el código fuente de src/', () => {
    const srcDir = path.resolve(__dirname, '../src');

    function scanDir(dir: string): string[] {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const matches: string[] = [];
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          matches.push(...scanDir(fullPath));
        } else if (/\.(tsx|ts|css)$/.test(entry.name)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.includes('py-0.2')) {
            matches.push(fullPath);
          }
        }
      }
      return matches;
    }

    const invalidFiles = scanDir(srcDir);
    expect(invalidFiles).toEqual([]);
  });

  it('globals.css incluye token --focus-ring y regla accesible :focus-visible', () => {
    const cssPath = path.resolve(__dirname, '../src/globals.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    expect(cssContent).toContain('--focus-ring');
    expect(cssContent).toContain(':focus-visible');
    expect(cssContent).toContain('outline: 2px solid var(--focus-ring)');
  });

  it('ReservationClient ofrece botones de horarios alternativos con target táctil accesible (min-h-[44px]) y aria-label', () => {
    const resPath = path.resolve(
      __dirname,
      '../src/app/[location]/reservar/ReservationClient.tsx'
    );
    const content = fs.readFileSync(resPath, 'utf8');

    expect(content).toContain('closestAlternative');
    expect(content).toContain('min-h-[44px]');
    expect(content).toContain('aria-label={`Horario ${slot.time} agotado');
  });

  it('WaitlistTrackingClient implementa animaciones con motion-safe y cálculo dinámico de tolerancia', () => {
    const waitlistPath = path.resolve(
      __dirname,
      '../src/app/track/fila/[token]/WaitlistTrackingClient.tsx'
    );
    const content = fs.readFileSync(waitlistPath, 'utf8');

    expect(content).toContain('motion-safe:animate-bounce');
    expect(content).toContain('motion-safe:animate-pulse');
    expect(content).toContain('calculateRemainingGrace');
  });
});
