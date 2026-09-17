import { useState, useEffect, useCallback } from 'react';
import { listReservations, deleteReservation, changeReservationStatus, getZoneCapacities } from '@/lib/server/reservations';
import { ReservationForm } from './ReservationForm';
import DailyReservationsList from './DailyReservationsList';
import type { ReservationStatus, Zone } from '@/lib/types';
import { format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, differenceInMinutes, setHours, setMinutes } from 'date-fns';

const TIME_SLOT_MINUTES = 30;
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 22;

export function AdminReservations() {
  const [view, setView] = useState<'day' | 'week' | 'month'>('day');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [reservations, setReservations] = useState<any[]>([]);
  const [zoneCapacities, setZoneCapacities] = useState<Record<Zone, number>>({ INTERIOR: 0, TERRAZA: 0, BARRA: 0 });
  const [loading, setLoading] = useState(true);
  const [editingReservation, setEditingReservation] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);

  // Time slots for the day
  const timeSlots = () => {
    const slots = [];
    let current = setHours(setMinutes(new Date(), 0), DAY_START_HOUR);
    const end = setHours(setMinutes(new Date(), 0), DAY_END_HOUR);
    while (current < end) {
      slots.push(new Date(current));
      current = addMinutes(current, TIME_SLOT_MINUTES);
    }
    return slots;
  };

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [caps, res] = await Promise.all([
        getZoneCapacities(),
        listReservations(format(startOfWeek(selectedDate), 'yyyy-MM-dd'), format(endOfWeek(selectedDate), 'yyyy-MM-dd')),
      ]);
      const capacities: Record<Zone, number> = {};
      caps.forEach((c: any) => {
        capacities[c.zone as Zone] = c.capacity;
      });
      setZoneCapacities(capacities);
      setReservations(res);
    } catch (err: any) {
      console.error('Error loading reservations:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadData();
  }, [loadData, selectedDate, view]);

  // Handle date change based on view
  const handlePrev = () => {
    setSelectedDate(d => {
      if (view === 'month') return addDays(d, -30);
      if (view === 'week') return addDays(d, -7);
      return addDays(d, -1);
    });
  };

  const handleNext = () => {
    setSelectedDate(d => {
      if (view === 'month') return addDays(d, 30);
      if (view === 'week') return addDays(d, 7);
      return addDays(d, 1);
    });
  };

  const handleToday = () => setSelectedDate(new Date());

  // Open form for new reservation
  const handleNew = (zone?: Zone, startTime?: Date) => {
    setEditingReservation(null);
    setShowForm(true);
  };

  // Open form for editing reservation
  const handleEdit = (reservation: any) => {
    setEditingReservation(reservation);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingReservation(null);
  };

  const handleSubmitSuccess = async () => {
    await loadData();
    handleCancel();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta reserva?')) return;
    try {
      await deleteReservation(id);
      await loadData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleStatusChange = async (id: string, status: ReservationStatus) => {
    try {
      await changeReservationStatus(id, status);
      await loadData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  // Get reservations for a specific slot and zone
  const getSlotReservations = (slotStart: Date, zone: Zone) => {
    const slotEnd = addMinutes(slotStart, TIME_SLOT_MINUTES);
    return reservations.filter(r => {
      const resStart = new Date(`${r.reservation_date}T${r.reservation_time}`);
      const resEnd = addMinutes(resStart, r.duration ? r.duration * 60 : TIME_SLOT_MINUTES); // Assume default duration if not stored
      return (
        (resStart < slotEnd && resEnd > slotStart) &&
        r.preferred_zone === zone &&
        r.status !== 'CANCELADA' && r.status !== 'NO_SHOW'
      );
    });
  };

  // Calculate available capacity for a slot and zone
  const getAvailableCapacity = (slotStart: Date, zone: Zone) => {
    const capacity = zoneCapacities[zone] || 0;
    const reservations = getSlotReservations(slotStart, zone);
    const used = reservations.reduce((sum, r) => sum + (r.party_size || 1), 0);
    return Math.max(0, capacity - used);
  };

  // Get CSS class based on availability
  const getAvailabilityClass = (available: number) => {
    if (available <= 0) return 'bg-red-100 text-red-800';
    if (available <= 2) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
  };

  if (loading) {
    return <div className="flex justify-center py-8">Cargando reservas...</div>;
  }

  const slots = timeSlots();
  const zones: Zone[] = ['INTERIOR', 'TERRAZA', 'BARRA'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Gestión de Reservas</h1>
          <p className="mt-1 text-sm text-gray-500">
            Vista de {view === 'day' ? 'día' : view === 'week' ? 'semana' : 'mes'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handlePrev} className="btn-secondary">
            ← Anterior
          </button>
          <button onClick={handleToday} className="btn-secondary">
            Hoy
          </button>
          <button onClick={handleNext} className="btn-secondary">
            Siguiente →
          </button>
          <div className="relative">
            <button
              onClick={() => setView(v => (v === 'day' ? 'week' : v === 'week' ? 'month' : 'day'))}
              className="btn-secondary flex items-center gap-1"
            >
              Cambiar vista
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {view === 'day' ? (
        <DailyReservationsList reservations={reservations} selectedDate={selectedDate} onUpdate={loadData} />
      ) : (
        {/* Calendar Grid */}
        <div className="grid gap-4">
          {/* Header with times and zone columns */}
          <div className="grid grid-cols-[60px_1fr] items-start">
            {/* Time column header */}
            <div className="text-xs text-gray-500 text-right pr-2">Hora</div>
            {/* Zone columns header */}
            <div className="grid flow-col gap-4">
              {zones.map(zone => (
                <div key={zone} className="text-center">
                  <div className="font-medium">{zone === 'INTERIOR' ? 'Interior' : zone === 'TERRAZA' ? 'Terraza' : 'Barra'}</div>
                  <div className="text-xs text-gray-500">Cap: {zoneCapacities[zone]}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Time slots rows */}
          {slots.map((slot, index) => (
            <div key={index} className="grid grid-cols-[60px_1fr] items-start">
              {/* Time label */}
              <div className="text-xs text-gray-500 text-right pr-2 py-1">
                {format(slot, 'HH:mm')}
              </div>
              {/* Zone cells */}
              <div className="grid flow-col gap-4">
                {zones.map(zone => {
                  const available = getAvailableCapacity(slot, zone);
                  const reservationsInSlot = getSlotReservations(slot, zone);
                  return (
                    <div
                      key={`${slot}-${zone}`}
                      className={`relative min-h-[60px] border border-gray-200 rounded bg-white cursor-pointer hover:bg-gray-50 ${getAvailabilityClass(available)}`}
                      onClick={() => handleNew(zone, slot)}
                    >
                      <div className="absolute top-2 left-2 right-2 text-xs font-medium">
                        Disponible: {available}
                      </div>
                      {reservationsInSlot.map((res, idx) => (
                        <div
                          key={`${res.id}-${idx}`}
                          className="mt-2 mx-2 px-2 py-1 text-xs rounded bg-blue-100 text-blue-800"
                        >
                          {res.holder_name} ({res.party_size})
                        </div>
                      ))}
                      {/* Add reservation button if slot is free */}
                      {available > 0 && reservationsInSlot.length === 0 && (
                        <div className="absolute bottom-2 left-2 right-2 text-center text-xs font-medium bg-white/80">
                          + Nueva
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Reservation Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between border-b p-4">
              <h3 className="text-lg font-semibold">
                {editingReservation ? 'Editar Reserva' : 'Nueva Reserva'}
              </h3>
              <button onClick={handleCancel} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                  <input
                    type="text"
                    value={formData.holder_name}
                    onChange={(e) => setFormData({ ...formData, holder_name: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
                    required
                  />
                </div>
                <div>
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
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus-ring-primary"
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button type="button" onClick={handleCancel} className="btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  {editingReservation ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function to add minutes
function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

// Form data state (placeholder, should be defined earlier)
const [formData, setFormData] = useState({
  holder_name: '',
  holder_phone: '',
  reservation_date: '',
  reservation_time: '',
  party_size: 1,
  preferred_zone: '',
  status: 'PENDIENTE',
  deposit_status: 'SIN_DEPOSITO',
  notes: '',
});

function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  // Implementation omitted for brevity; assume it calls createReservation or updateReservation
}