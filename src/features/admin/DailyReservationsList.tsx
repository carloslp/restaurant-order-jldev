'use client';

import { useState } from 'react';
import { changeReservationStatus, updateReservation } from '@/lib/server/reservations';
import type { ReservationStatus, Zone } from '@/lib/types';
import { format } from 'date-fns';
import { 
  Phone, 
  Users, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  MessageSquare,
  Building2,
  Trees,
  Coffee,
  ExternalLink
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface DailyReservationsListProps {
  reservations: any[];
  selectedDate: Date;
  onUpdate: () => Promise<void>;
}

export function DailyReservationsList({ reservations, selectedDate, onUpdate }: DailyReservationsListProps) {
  const { toast } = useToast();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const filtered = reservations
    .filter((r) => r.reservation_date === format(selectedDate, 'yyyy-MM-dd'))
    .sort((a, b) => a.reservation_time.localeCompare(b.reservation_time));

  const handleStatusChange = async (id: string, status: ReservationStatus) => {
    setUpdatingId(id);
    try {
      await changeReservationStatus(id, status);
      toast({ 
        title: 'Estado actualizado', 
        description: `La reserva cambió a ${status.toLowerCase()}.` 
      });
      await onUpdate();
    } catch (err: any) {
      toast({ 
        title: 'Error', 
        description: err.message || 'No se pudo actualizar el estado.', 
        variant: 'destructive' 
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDepositChange = async (id: string) => {
    setUpdatingId(id);
    try {
      await updateReservation(id, { deposit_status: 'DEPOSITADO' });
      toast({ title: 'Depósito registrado', description: 'El depósito se marcó como pagado.' });
      await onUpdate();
    } catch (err: any) {
      toast({ 
        title: 'Error', 
        description: err.message || 'No se pudo actualizar el depósito.', 
        variant: 'destructive' 
      });
    } finally {
      setUpdatingId(null);
    }
  };

  if (filtered.length === 0) {
    return (
      <div className="text-center py-16 bg-zinc-50 rounded-2xl border-2 border-dashed border-zinc-200">
        <Clock className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
        <p className="text-base font-semibold text-zinc-700">No hay reservas programadas para este día</p>
        <p className="text-xs text-zinc-400 mt-1">
          Usa el botón "+ Nueva Reserva" para agendar a un cliente manualmente.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {filtered.map((res) => {
        const isBusy = updatingId === res.id;
        const ZoneIcon = res.preferred_zone === 'INTERIOR' ? Building2 : res.preferred_zone === 'TERRAZA' ? Trees : Coffee;
        
        // Formato para enlace directo a WhatsApp (limpieza de teléfono)
        const cleanPhone = (res.holder_phone || '').replace(/\D/g, '');
        const waLink = cleanPhone.length === 10 ? `https://wa.me/52${cleanPhone}` : `https://wa.me/${cleanPhone}`;

        return (
          <div 
            key={res.id} 
            className={`bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between ${
              res.status === 'PENDIENTE' ? 'border-amber-300 ring-1 ring-amber-200' : 'border-zinc-200'
            }`}
          >
            <div>
              {/* Cabecera de la tarjeta: Hora, Zona y Estado */}
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl font-extrabold text-zinc-900">{res.reservation_time}</span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-700">
                    <ZoneIcon className="w-3 h-3 text-zinc-500" />
                    {res.preferred_zone === 'INTERIOR' ? 'Interior' : res.preferred_zone === 'TERRAZA' ? 'Terraza' : 'Barra'}
                  </span>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  res.status === 'CONFIRMADA' ? 'bg-emerald-100 text-emerald-800' : 
                  res.status === 'PENDIENTE' ? 'bg-amber-100 text-amber-800 animate-pulse' : 
                  res.status === 'NO_SHOW' ? 'bg-purple-100 text-purple-800' :
                  'bg-rose-100 text-rose-800'
                }`}>
                  {res.status}
                </span>
              </div>

              {/* Titular y Comensales */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between">
                  <p className="text-base font-bold text-zinc-900">{res.holder_name}</p>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded-lg">
                    <Users className="w-3 h-3" />
                    {res.party_size} {res.party_size === 1 ? 'persona' : 'personas'}
                  </span>
                </div>

                {/* Teléfono y WhatsApp */}
                <div className="flex items-center gap-3 text-xs text-zinc-500">
                  <a 
                    href={`tel:${res.holder_phone}`}
                    className="flex items-center gap-1 text-zinc-700 hover:text-orange-600 font-medium"
                  >
                    <Phone className="w-3 h-3 text-orange-500" />
                    {res.holder_phone}
                  </a>
                  {cleanPhone && (
                    <a 
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-semibold"
                    >
                      <ExternalLink className="w-3 h-3" />
                      WhatsApp
                    </a>
                  )}
                </div>

                {/* Notas especiales si existen */}
                {res.notes && (
                  <div className="p-2.5 bg-zinc-50 rounded-xl border border-zinc-100 text-xs text-zinc-600 flex items-start gap-1.5 mt-2">
                    <MessageSquare className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                    <p className="italic">{res.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Acciones de gestión */}
            <div className="pt-3 border-t border-zinc-100 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {res.status !== 'CONFIRMADA' && (
                  <button 
                    onClick={() => handleStatusChange(res.id, 'CONFIRMADA')}
                    disabled={isBusy}
                    className="inline-flex items-center justify-center gap-1 text-xs py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm transition disabled:opacity-50 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Aceptar / Confirmar
                  </button>
                )}

                {res.status !== 'CANCELADA' && (
                  <button 
                    onClick={() => handleStatusChange(res.id, 'CANCELADA')}
                    disabled={isBusy}
                    className="inline-flex items-center justify-center gap-1 text-xs py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold border border-rose-200 transition disabled:opacity-50 cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Rechazar
                  </button>
                )}

                {res.status === 'CONFIRMADA' && (
                  <button 
                    onClick={() => handleStatusChange(res.id, 'NO_SHOW')}
                    disabled={isBusy}
                    className="inline-flex items-center justify-center gap-1 text-xs py-2 px-3 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold border border-purple-200 transition disabled:opacity-50 cursor-pointer"
                  >
                    Marcar No-Show
                  </button>
                )}

                {res.deposit_status !== 'DEPOSITADO' && (
                  <button 
                    onClick={() => handleDepositChange(res.id)}
                    disabled={isBusy}
                    className="inline-flex items-center justify-center gap-1 text-xs py-2 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold border border-blue-200 transition disabled:opacity-50 cursor-pointer"
                  >
                    Depósito recibido
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
