import { useState, useEffect } from 'react';
import { createReservation, updateReservation } from '@/lib/server/reservations';
import type { ReservationStatus, Zone } from '@/lib/types';

interface ReservationFormProps {
  reservation?: any | null;
  initialData?: any;
  onSuccess: () => void;
  onCancel: () => void;
}

export function ReservationForm({ reservation, initialData, onSuccess, onCancel }: ReservationFormProps) {
  const [formData, setFormData] = useState<any>(null);

  useEffect(() => {
    if (reservation) {
      setFormData({
        holder_name: reservation.holder_name,
        holder_phone: reservation.holder_phone,
        reservation_date: reservation.reservation_date,
        reservation_time: reservation.reservation_time,
        party_size: reservation.party_size,
        preferred_zone: reservation.preferred_zone,
        status: reservation.status,
        deposit_status: reservation.deposit_status,
        notes: reservation.notes || '',
      });
    } else if (initialData) {
      setFormData(initialData);
    }
  }, [reservation, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (reservation) {
        await updateReservation(reservation.id, formData);
      } else {
        await createReservation(formData);
      }
      onSuccess();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  if (!formData) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="text-lg font-semibold">
            {reservation ? 'Editar Reserva' : 'Nueva Reserva'}
          </h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
              <input
                type="text"
                value={formData.holder_name}
                onChange={(e) => setFormData({ ...formData, holder_name: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono *</label>
              <input
                type="tel"
                value={formData.holder_phone}
                onChange={(e) => setFormData({ ...formData, holder_phone: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
              <input
                type="date"
                value={formData.reservation_date}
                onChange={(e) => setFormData({ ...formData, reservation_date: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
              <input
                type="time"
                value={formData.reservation_time}
                onChange={(e) => setFormData({ ...formData, reservation_time: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tamaño del grupo *</label>
              <input
                type="number"
                value={formData.party_size}
                onChange={(e) => setFormData({ ...formData, party_size: Number(e.target.value) || 1 })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
                min="1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zona preferida *</label>
              <select
                value={formData.preferred_zone}
                onChange={(e) => setFormData({ ...formData, preferred_zone: e.target.value as Zone })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
                required
              >
                <option value="">Selecciona una zona</option>
                <option value="INTERIOR">Interior</option>
                <option value="TERRAZA">Terraza</option>
                <option value="BARRA">Barra</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
              >
                <option value="PENDIENTE">Pendiente</option>
                <option value="CONFIRMADA">Confirmada</option>
                <option value="CANCELADA">Cancelada</option>
                <option value="NO_SHOW">No Show</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Depósito</label>
              <select
                value={formData.deposit_status}
                onChange={(e) => setFormData({ ...formData, deposit_status: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
              >
                <option value="SIN_DEPOSITO">Sin depósito</option>
                <option value="DEPOSITO_PENDIENTE">Depósito pendiente</option>
                <option value="DEPOSITADO">Depositado</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
                rows={3}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <button type="button" onClick={onCancel} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              {reservation ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
