'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Users, 
  Clock, 
  CheckCircle2, 
  BellRing, 
  Sparkles, 
  MapPin, 
  RefreshCw, 
  AlertTriangle, 
  XCircle,
  UtensilsCrossed
} from 'lucide-react';
import { getWaitlistStatusByToken, cancelPublicWaitlistByToken } from '@/lib/server/waitlist';
import type { WaitlistParty, WaitlistStatus } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';

interface Props {
  initialData: {
    id: string;
    customer_name: string;
    party_size: number;
    preferred_zone: string;
    status: WaitlistStatus;
    position: number;
    totalWaiting: number;
    estimatedMinutes: number;
    called_at?: string | null;
    seated_at?: string | null;
    table_number?: string | null;
    created_at: string;
  };
  token: string;
  localName: string;
}

export default function WaitlistTrackingClient({ initialData, token, localName }: Props) {
  const router = useRouter();
  const [party, setParty] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [graceSecondsLeft, setGraceSecondsLeft] = useState(600); // 10 minutos de tolerancia

  // CA-5.1: Alerta sensorial con vibración móvil cuando la mesa está lista
  useEffect(() => {
    if (party.status === 'LLAMADO') {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate([200, 100, 200, 100, 200]);
        } catch {
          // Navegador bloqueó vibración sin interacción previa
        }
      }
    }
  }, [party.status]);

  // CA-5.1: Temporizador regresivo de gracia en vivo
  useEffect(() => {
    if (party.status !== 'LLAMADO') return;
    const timer = setInterval(() => {
      setGraceSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [party.status]);

  const formatCountdown = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  // Recarga manual y periódica del estado del turno
  const refreshStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getWaitlistStatusByToken(token);
      if (res.ok && res.party) {
        setParty(res.party);
      }
    } catch (e) {
      console.error('Error refreshing waitlist status:', e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Suscripción Realtime y polling de respaldo (solo activo si el turno no es terminal)
  useEffect(() => {
    const isTerminal = ['SENTADO', 'NO_SHOW', 'CANCELADO'].includes(party.status);
    if (isTerminal) {
      return; // No abrir WebSockets ni timers si ya concluyó el turno
    }

    const supabase = createClient();
    const channel = supabase
      .channel(`waitlist-${token}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'waitlist',
          filter: `id=eq.${party.id}`,
        },
        (payload: { new: { status?: WaitlistStatus } }) => {
          const updated = payload.new;
          if (updated?.status && ['SENTADO', 'NO_SHOW', 'CANCELADO'].includes(updated.status)) {
            // Desconectar canal inmediatamente ante estado terminal
            void supabase.removeChannel(channel);
          }
          refreshStatus();
        }
      )
      .subscribe();

    const triggerRefreshIfVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        refreshStatus();
      }
    };

    const interval = setInterval(triggerRefreshIfVisible, 25000); // Polling de respaldo inteligente cada 25s
    document.addEventListener('visibilitychange', triggerRefreshIfVisible);

    return () => {
      void supabase.removeChannel(channel);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', triggerRefreshIfVisible);
    };
  }, [party.id, party.status, refreshStatus, token]);

  const handleCancel = async () => {
    if (!confirm('¿Seguro que deseas salir de la fila de espera? Perderás tu lugar actual.')) return;
    setCancelling(true);
    try {
      const res = await cancelPublicWaitlistByToken(token);
      if (res.ok) {
        setParty((prev) => ({ ...prev, status: 'CANCELADO' }));
      }
    } catch {
      alert('No se pudo cancelar el turno.');
    } finally {
      setCancelling(false);
    }
  };

  const isCalled = party.status === 'LLAMADO';
  const isSeated = party.status === 'SENTADO';
  const isCancelled = party.status === 'CANCELADO' || party.status === 'NO_SHOW';

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col justify-between selection:bg-orange-600 selection:text-white">
      {/* Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-md mx-auto px-4 py-3.5 flex items-center justify-between">
          <div>
            <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Tu Turno en Vivo</div>
            <h1 className="text-sm sm:text-base font-black text-white truncate max-w-[200px]">{localName}</h1>
          </div>
          <button
            type="button"
            onClick={refreshStatus}
            disabled={loading}
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-all select-none active:scale-95"
            title="Actualizar lugar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-orange-500' : ''}`} />
          </button>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="max-w-md mx-auto px-4 py-6 flex-1 w-full flex flex-col justify-center">
        {/* CASO 1: ¡LLAMADO! (Mesa lista) */}
        {isCalled && (
          <div className="bg-emerald-950/40 border-2 border-emerald-500 rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-3xl flex items-center justify-center mx-auto border border-emerald-500/40 shadow-lg animate-bounce">
              <BellRing className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-500 text-zinc-950 uppercase tracking-wider">
                ¡Tu mesa está lista!
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white">
                {party.customer_name}
              </h2>
              <p className="text-sm text-emerald-300 font-medium">
                Por favor preséntate en la entrada con el Hostess para pasar a tu mesa
                {party.table_number ? ` (Mesa ${party.table_number})` : ''}.
              </p>
            </div>

            {/* CA-5.1: Contador regresivo de tolerancia en vivo */}
            <div className="bg-emerald-900/40 border border-emerald-800/60 rounded-2xl p-4 text-xs text-emerald-200">
              ⏱️ Tiempo de tolerancia restante:{' '}
              <strong className="font-mono text-sm text-white bg-emerald-950 px-2 py-0.5 rounded-md border border-emerald-700">
                {formatCountdown(graceSecondsLeft)} min
              </strong>{' '}
              para presentarte en puerta antes de pasar al siguiente turno.
            </div>

            {/* CA-5.1: Botón de confirmación de asistencia en camino */}
            {!acknowledged ? (
              <button
                type="button"
                onClick={() => setAcknowledged(true)}
                className="w-full py-3.5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-sm uppercase tracking-wider shadow-lg shadow-emerald-500/25 active:scale-[0.98] transition cursor-pointer"
              >
                🏃 Voy para allá (Confirmar asistencia)
              </button>
            ) : (
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 font-bold text-xs flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>¡Excelente! Avisamos a la recepción que vienes en camino.</span>
              </div>
            )}
          </div>
        )}

        {/* CASO 2: YA SENTADO */}
        {isSeated && (
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-xl">
            <div className="w-16 h-16 bg-orange-600/20 text-orange-400 rounded-2xl flex items-center justify-center mx-auto border border-orange-500/30">
              <UtensilsCrossed className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h2 className="text-2xl font-black text-white">¡Buen provecho!</h2>
              <p className="text-sm text-zinc-400">
                Ya te encuentras disfrutando en tu mesa{party.table_number ? ` (${party.table_number})` : ''}.
              </p>
            </div>
          </div>
        )}

        {/* CASO 3: CANCELADO / NO SHOW */}
        {isCancelled && (
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-xl">
            <div className="w-16 h-16 bg-red-600/20 text-red-400 rounded-2xl flex items-center justify-center mx-auto border border-red-500/30">
              <XCircle className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-white">Turno Finalizado</h2>
              <p className="text-xs text-zinc-400">
                Este turno en la fila fue cancelado o expiró por tiempo de espera.
              </p>
            </div>
          </div>
        )}

        {/* CASO 4: EN ESPERA NORMAL */}
        {!isCalled && !isSeated && !isCancelled && (
          <div className="space-y-5">
            {/* Tarjeta de Posición Hero */}
            <div className="bg-gradient-to-b from-zinc-900 to-zinc-900/80 border border-zinc-800 rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-orange-600/10 rounded-full blur-2xl pointer-events-none" />

              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-950/60 border border-orange-800/40 text-orange-400 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                <span>En Espera</span>
              </div>

              {/* Posición en Fila */}
              <div className="space-y-1">
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">Tu lugar en la fila</div>
                <div className="text-6xl sm:text-7xl font-black tracking-tight text-white flex items-center justify-center gap-1">
                  <span className="text-orange-500 font-extrabold text-4xl sm:text-5xl">#</span>
                  <span>{party.position}</span>
                </div>
                <div className="text-xs text-zinc-400 font-medium pt-1">
                  {party.position === 1 ? (
                    <span className="text-orange-400 font-bold">¡Eres el siguiente en entrar!</span>
                  ) : (
                    <span>Hay {party.position - 1} {party.position - 1 === 1 ? 'grupo' : 'grupos'} antes que tú</span>
                  )}
                </div>
              </div>

              {/* Métricas: Tiempo estimado y comensales */}
              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-zinc-800">
                <div className="bg-zinc-950/70 rounded-2xl p-3 border border-zinc-800/60">
                  <div className="flex items-center justify-center gap-1 text-zinc-400 text-xs font-semibold mb-1">
                    <Clock className="w-3.5 h-3.5 text-orange-400" />
                    <span>Tiempo est.</span>
                  </div>
                  <div className="text-lg font-black text-white">~{party.estimatedMinutes} min</div>
                </div>

                <div className="bg-zinc-950/70 rounded-2xl p-3 border border-zinc-800/60">
                  <div className="flex items-center justify-center gap-1 text-zinc-400 text-xs font-semibold mb-1">
                    <Users className="w-3.5 h-3.5 text-orange-400" />
                    <span>Mesa para</span>
                  </div>
                  <div className="text-lg font-black text-white">{party.party_size} personas</div>
                </div>
              </div>

              <div className="text-[11px] text-zinc-500">
                Ubicación solicitada: <span className="font-semibold text-zinc-300">{party.preferred_zone}</span>
              </div>
            </div>

            {/* Aviso de funcionamiento */}
            <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-4 text-xs text-zinc-400 space-y-1">
              <div className="font-bold text-zinc-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                <span>No necesitas quedarte de pie en la puerta</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Puedes dar una vuelta cercana. Esta pantalla se actualizará automáticamente y te avisará cuando tu mesa esté lista.
              </p>
            </div>

            {/* Botón para cancelar turno con modal preventivo */}
            <button
              type="button"
              onClick={() => setShowCancelModal(true)}
              disabled={cancelling}
              className="w-full py-3 rounded-xl border border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-900/50 text-xs font-bold transition-all select-none cursor-pointer"
            >
              {cancelling ? 'Cancelando lugar…' : 'Ya no puedo esperar (Salir de la fila)'}
            </button>
          </div>
        )}
      </main>

      {/* CA-5.1: Modal accesible de confirmación destructiva para salir de la fila */}
      {showCancelModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-waitlist-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in"
        >
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-red-600/20 text-red-500 flex items-center justify-center mx-auto border border-red-500/30">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 id="cancel-waitlist-title" className="text-base font-bold text-white">
                ¿Seguro que deseas salir de la fila?
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                Perderás tu lugar actual (#{party.position}) y tendrás que formarte de nuevo.
              </p>
            </div>
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs transition cursor-pointer"
              >
                Volver a la fila
              </button>
              <button
                type="button"
                disabled={cancelling}
                onClick={async () => {
                  setCancelling(true);
                  try {
                    const res = await cancelPublicWaitlistByToken(token);
                    if (res.ok) {
                      setParty((prev) => ({ ...prev, status: 'CANCELADO' }));
                      setShowCancelModal(false);
                    }
                  } catch {
                    alert('No se pudo cancelar el turno.');
                  } finally {
                    setCancelling(false);
                  }
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition disabled:opacity-50 cursor-pointer"
              >
                {cancelling ? 'Cancelando...' : 'Sí, salir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="py-4 text-center text-[11px] text-zinc-600 border-t border-zinc-900">
        Sistema de Fila Virtual • {localName}
      </footer>
    </div>
  );
}
