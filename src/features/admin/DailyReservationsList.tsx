import { useCallback } from 'react';
import { changeReservationStatus, updateReservation } from '@/lib/server/reservations';
import type { ReservationStatus, Zone } from '@/lib/types';
import { format } from 'date-fns';

interface DailyReservationsListProps {
  reservations: any[];
  selectedDate: Date;
  onUpdate: () => Promise<void>;
}

export function DailyReservationsList({ reservations, selectedDate, onUpdate }: DailyReservationsListProps) {
  const filtered = reservations
    .filter(r => r.reservation_date === format(selectedDate, 'yyyy-MM-dd'))
    .sort((a, b) => a.reservation_time.localeCompare(b.reservation_time));

  const handleStatusChange = async (id: string, status: ReservationStatus) => {
    try {
      await changeReservationStatus(id, status);
      await onUpdate();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleDepositChange = async (id: string) => {
    try {
      await updateReservation(id, { deposit_status: 'DEPOSITADO' });
      await onUpdate();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  if (filtered.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
        <p className="text-gray-500">No hay reservas para el día seleccionado.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {filtered.map((res) => (
        <div key={res.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-3">
            <div>
              <span className="text-lg font-bold text-gray-900">{res.reservation_time}</span>
              <span className="ml-2 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                {res.preferred_zone === 'INTERIOR' ? 'Interior' : res.preferred_zone === 'TERRAZA' ? 'Terraza' : 'Barra'}
              </span>
            </div>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              res.status === 'CONFIRMADA' ? 'bg-green-100 text-green-700' : 
              res.status === 'PENDIENTE' ? 'bg-yellow-100 text-yellow-700' : 
              'bg-red-100 text-red-700'
            }`}>
              {res.status}
            </span>
          </div>

          <div className="space-y-1 mb-4">
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">{res.holder_name}</span> • {res.party_size} comensales
            </p>
            <p className="text-xs text-gray-500">
              Depósito: 
              <span className={`ml-1 font-medium ${
                res.deposit_status === 'DEPOSITADO' ? 'text-green-600' : 'text-orange-600'
              }`}>
                {res.deposit_status === 'SIN_DEPOSITO' ? 'No requiere' : 
                 res.deposit_status === 'DEPOSITADO' ? 'Pagado' : 'Pendiente'}
              </span>
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button 
              onClick={() => handleStatusChange(res.id, 'CONFIRMADA')}
              disabled={res.status === 'CONFIRMADA'}
              className="text-xs py-1.5 px-2 rounded bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed font-medium border border-green-200"
            >
              Confirmar
            </button>
            <button 
              onClick={() => handleStatusChange(res.id, 'CANCELADA')}
              disabled={res.status === 'CANCELADA'}
              className="text-xs py-1.5 px-2 rounded bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed font-medium border border-red-200"
            >
              Cancelar
            </button>
            <button 
              onClick={() => handleDepositChange(res.id)}
              disabled={res.deposit_status === 'DEPOSITADO'}
              className="text-xs py-1.5 px-2 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed font-medium border border-blue-200"
            >
              Depositado
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
