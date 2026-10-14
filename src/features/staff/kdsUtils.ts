// Utilidades y lógica de estado para el Kitchen Display System (KDS)
// Feature F-03: Ergonomía Táctil y Modo Alta Demanda

export type KdsUrgencyLevel = 'normal' | 'warning' | 'urgent';

/**
 * Calcula los minutos transcurridos desde la creación del pedido.
 */
export function getElapsedMinutes(createdAtIso: string, nowMs = Date.now()): number {
  const createdMs = new Date(createdAtIso).getTime();
  if (Number.isNaN(createdMs)) return 0;
  return Math.max(0, Math.floor((nowMs - createdMs) / 60000));
}

export * from './kdsAudio';

/**
 * Determina el nivel de urgencia visual de un pedido en KDS.
 * FEATURE F-02 CA-2:
 * - Dado un pedido en estado "En preparación" (EN_PREPARACION):
 *   - Si tiempo transcurrido >= 10 minutos (y < 18) -> 'warning' (ámbar #D97706)
 *   - Si tiempo transcurrido >= 18 minutos -> 'urgent' (fondo #FEF2F2 y borde #DC2626)
 * - Otros estados permanecen en 'normal'
 */
export function getKdsUrgencyLevel(status: string, elapsedMinutes: number): KdsUrgencyLevel {
  if (status !== 'EN_PREPARACION') {
    return 'normal';
  }
  if (elapsedMinutes >= 18) {
    return 'urgent';
  }
  if (elapsedMinutes >= 10) {
    return 'warning';
  }
  return 'normal';
}

export interface KdsCardVisuals {
  urgencyLevel: KdsUrgencyLevel;
  borderClass: string;
  bgClass: string;
  pulseClass: string;
  staticIndicator: string | null;
  badgeClass: string | null;
}

/**
 * Retorna las clases visuales y el indicador estático para la tarjeta en KDS.
 * Cumple con prefers-reduced-motion, CA-2 con hex codes y accesibilidad.
 */
export function getKdsCardVisuals(status: string, elapsedMinutes: number): KdsCardVisuals {
  const urgencyLevel = getKdsUrgencyLevel(status, elapsedMinutes);

  switch (urgencyLevel) {
    case 'urgent':
      return {
        urgencyLevel: 'urgent',
        borderClass: 'border-2 border-[#DC2626] shadow-red-500/10',
        bgClass: 'bg-[#FEF2F2]',
        pulseClass: 'motion-safe:animate-pulse',
        staticIndicator: '🚨 Urgente (+18 min)',
        badgeClass: 'bg-red-100 text-[#DC2626] border border-red-300 font-extrabold',
      };
    case 'warning':
      return {
        urgencyLevel: 'warning',
        borderClass: 'border-2 border-dashed border-[#D97706] shadow-amber-500/10',
        bgClass: 'bg-amber-50/20',
        pulseClass: '',
        staticIndicator: '⏱️ Demora (+10 min)',
        badgeClass: 'bg-amber-100 text-[#D97706] border border-amber-300 font-bold',
      };
    case 'normal':
    default:
      return {
        urgencyLevel: 'normal',
        borderClass: 'border border-gray-200',
        bgClass: 'bg-white',
        pulseClass: '',
        staticIndicator: '✅ A tiempo',
        badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold',
      };
  }
}

export interface KdsActionConfig {
  actionLabel: string;
  nextStatus: 'EN_PREPARACION' | 'LISTO' | 'COMPLETADO';
  buttonClass: string;
}

/**
 * Configuración del botón táctil inferior de avance de comanda (CA-2).
 * Altura mínima garantizada de 56px (min-h-[56px]) y ancho completo (w-full).
 */
export function getKdsActionConfig(
  status: string,
  orderType: string
): KdsActionConfig | null {
  if (status === 'CONFIRMADO_CAJA') {
    return {
      actionLabel: '🔥 Comenzar Preparación',
      nextStatus: 'EN_PREPARACION',
      buttonClass:
        'bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-950 text-white shadow-sm',
    };
  }

  if (status === 'EN_PREPARACION') {
    return {
      actionLabel: '✅ Marcar Listo',
      nextStatus: 'LISTO',
      buttonClass:
        'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-md shadow-emerald-600/25',
    };
  }

  if (status === 'LISTO' && orderType === 'EN_MESA') {
    return {
      actionLabel: '🍽️ Servido en Mesa',
      nextStatus: 'COMPLETADO',
      buttonClass:
        'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-md shadow-blue-600/25',
    };
  }

  return null;
}
