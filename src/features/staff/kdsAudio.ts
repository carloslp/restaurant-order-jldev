// src/features/staff/kdsAudio.ts
// ENABLER E-02: Generador de tonos Web Audio API para alertas en KDS

let sharedAudioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioContext) {
    const AudioCtxClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtxClass) {
      sharedAudioContext = new AudioCtxClass();
    }
  }
  return sharedAudioContext;
}

export interface PlayChimeOptions {
  volume?: number; // 0 a 1
  isMuted?: boolean;
}

/**
 * CA-1: Señal acústica de doble tono (440 Hz → 880 Hz, 150 ms cada uno).
 * Síntesis nativa sin dependencias externas ni descarga de archivos MP3.
 */
export async function playNewOrderChime(options: PlayChimeOptions = {}): Promise<boolean> {
  const { volume = 1, isMuted = false } = options;
  if (isMuted || volume <= 0) return false;

  const ctx = getAudioContext();
  if (!ctx) return false;

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';

    // Primer tono: 440 Hz por 150 ms
    osc.frequency.setValueAtTime(440, now);
    // Segundo tono: 880 Hz por 150 ms
    osc.frequency.setValueAtTime(880, now + 0.15);

    // Control de ganancia con envolvente suave para evitar clicks acústicos
    const targetGain = Math.min(1, Math.max(0, volume)) * 0.35;
    gain.gain.setValueAtTime(targetGain, now);
    gain.gain.setValueAtTime(targetGain, now + 0.28);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.30);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.30);

    return true;
  } catch (err) {
    console.warn('kdsAudio: No se pudo emitir la alerta sonora:', err);
    return false;
  }
}

/**
 * CA-3.2: Tono de alerta suave para aviso de pérdida de conexión o comanda demorada.
 */
export async function playAlertTone(options: PlayChimeOptions = {}): Promise<boolean> {
  const { volume = 1, isMuted = false } = options;
  if (isMuted || volume <= 0) return false;

  const ctx = getAudioContext();
  if (!ctx) return false;

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.setValueAtTime(240, now + 0.15);

    const targetGain = Math.min(1, Math.max(0, volume)) * 0.25;
    gain.gain.setValueAtTime(targetGain, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.30);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.30);

    return true;
  } catch (err) {
    console.warn('kdsAudio: No se pudo emitir la alerta de conexión:', err);
    return false;
  }
}

