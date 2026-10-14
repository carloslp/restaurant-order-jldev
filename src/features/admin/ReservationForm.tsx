import { useState, useEffect } from 'react';
import { createReservation, updateReservation } from '@/lib/server/reservations';
import type { ReservationStatus, RestaurantTable, Zone } from '@/lib/types';
import { FormAlert, FieldError, fieldAria } from '@/components/ui/form-error';
import { useServerForm } from '@/lib/forms';

interface ReservationFormProps {
  reservation?: any | null;
  tables?: RestaurantTable[];
  initialData?: any;
  onSuccess: () => void;
  onCancel: () => void;
}

export function ReservationForm({ reservation, tables = [], initialData, onSuccess, onCancel }: ReservationFormProps) {
  const [formData, setFormData] = useState<any>(null);
  const { saving, formError, fieldErrors, clearFieldError, submit } = useServerForm();

  useEffect(() => {
    if (reservation) {
      const initTableIds = Array.isArray(reservation.table_ids) && reservation.table_ids.length > 0
        ? reservation.table_ids
        : reservation.table_id
        ? [reservation.table_id]
        : [];
      setFormData({
        holder_name: reservation.holder_name,
        holder_phone: reservation.holder_phone,
        reservation_date: reservation.reservation_date,
        reservation_time: reservation.reservation_time,
        party_size: reservation.party_size,
        preferred_zone: reservation.preferred_zone,
        table_id: initTableIds[0] || null,
        table_ids: initTableIds,
        status: reservation.status,
        deposit_status: reservation.deposit_status,
        notes: reservation.notes || '',
      });
    } else if (initialData) {
      const initTableIds = Array.isArray(initialData.table_ids) && initialData.table_ids.length > 0
        ? initialData.table_ids
        : initialData.table_id
        ? [initialData.table_id]
        : [];
      setFormData({
        ...initialData,
        table_id: initTableIds[0] || null,
        table_ids: initTableIds,
      });
    } else {
      setFormData({
        holder_name: '',
        holder_phone: '',
        reservation_date: new Date().toISOString().slice(0, 10),
        reservation_time: '14:00',
        party_size: 2,
        preferred_zone: 'INTERIOR',
        table_id: null,
        table_ids: [],
        status: 'CONFIRMADA',
        deposit_status: 'SIN_DEPOSITO',
        notes: '',
      });
    }
  }, [reservation, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await submit(async () => {
      if (reservation) {
        await updateReservation(reservation.id, formData);
      } else {
        await createReservation(formData);
      }
    });
    if (ok) onSuccess();
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
          <FormAlert message={formError} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
              <input
                type="text"
                value={formData.holder_name}
                onChange={(e) => { setFormData({ ...formData, holder_name: e.target.value }); clearFieldError('holder_name'); }}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
                required
                {...fieldAria('res-name-error', !!fieldErrors.holder_name)}
              />
              <FieldError id="res-name-error" message={fieldErrors.holder_name} />
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono *</label>
              <input
                type="tel"
                value={formData.holder_phone}
                onChange={(e) => { setFormData({ ...formData, holder_phone: e.target.value }); clearFieldError('holder_phone'); }}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
                required
                {...fieldAria('res-phone-error', !!fieldErrors.holder_phone)}
              />
              <FieldError id="res-phone-error" message={fieldErrors.holder_phone} />
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
              {(() => {
                const zoneCap = (tables || [])
                  .filter((t) => t.is_active && t.zone === formData.preferred_zone)
                  .reduce((acc, t) => acc + (t.max_capacity || 0), 0);
                if (zoneCap > 0 && formData.party_size > zoneCap) {
                  return (
                    <p className="mt-1.5 text-xs text-red-600 font-bold bg-red-50 p-2 rounded-md border border-red-200">
                      ⚠️ El grupo ({formData.party_size} pax) excede la capacidad total configurada en {formData.preferred_zone} ({zoneCap} lugares).
                    </p>
                  );
                }
                return null;
              })()}
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">
                  Mesas asignadas (Permite unir varias mesas)
                </label>
                {(formData.table_ids?.length || 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, table_id: null, table_ids: [] })}
                    className="text-[11px] text-orange-600 hover:underline cursor-pointer"
                  >
                    Restablecer a auto-asignación
                  </button>
                )}
              </div>

              {/* Lista de mesas seleccionables para combinar */}
              <div className="border border-gray-200 rounded-lg p-2 max-h-36 overflow-y-auto space-y-1 bg-gray-50/50">
                {(tables || [])
                  .filter((t) => t.is_active && (!formData.preferred_zone || t.zone === formData.preferred_zone))
                  .map((t) => {
                    const isSelected = (formData.table_ids || []).includes(t.id);
                    return (
                      <label
                        key={t.id}
                        className={`flex items-center justify-between p-2 rounded-md border text-xs cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-orange-50 border-orange-400 text-orange-950 font-bold'
                            : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              const currentIds: string[] = formData.table_ids || [];
                              const nextIds = e.target.checked
                                ? [...currentIds, t.id]
                                : currentIds.filter((id) => id !== t.id);
                              setFormData({
                                ...formData,
                                table_ids: nextIds,
                                table_id: nextIds[0] || null,
                              });
                            }}
                            className="rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                          />
                          <span>Mesa {t.table_number} ({t.zone})</span>
                        </div>
                        <span className="text-[11px] text-gray-500 font-normal">
                          {t.min_capacity} a {t.max_capacity} pers.
                        </span>
                      </label>
                    );
                  })}
                {(tables || []).filter((t) => t.is_active && (!formData.preferred_zone || t.zone === formData.preferred_zone)).length === 0 && (
                  <p className="text-xs text-gray-500 text-center py-2">
                    No hay mesas activas en la zona seleccionada.
                  </p>
                )}
              </div>

              {/* Indicador de capacidad acumulada */}
              {(() => {
                const selected = (tables || []).filter((t) => (formData.table_ids || []).includes(t.id));
                const totalCap = selected.reduce((sum, t) => sum + t.max_capacity, 0);
                const isSufficient = totalCap >= formData.party_size;

                if (selected.length === 0) {
                  return (
                    <p className="text-[11px] text-gray-500 italic">
                      Sin mesas seleccionadas: el sistema asignará automáticamente la mesa física óptima.
                    </p>
                  );
                }

                return (
                  <div className={`text-xs px-2.5 py-1.5 rounded-md flex items-center justify-between ${
                    isSufficient ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}>
                    <span>
                      {selected.length === 1 ? '1 mesa' : `${selected.length} mesas unidas`} • Capacidad total: <strong>{totalCap} personas</strong>
                    </span>
                    <span className="font-bold text-[11px]">
                      {isSufficient ? '✓ Suficiente' : `⚠️ Faltan ${formData.party_size - totalCap} pax`}
                    </span>
                  </div>
                );
              })()}
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
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Guardando...' : reservation ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
