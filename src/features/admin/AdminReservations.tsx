'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  listReservations, 
  deleteReservation, 
  changeReservationStatus, 
  getZoneCapacities,
  upsertZoneCapacity,
  acceptReservation,
  rejectReservation,
  reassignReservationTable
} from '@/lib/server/reservations';
import { getStaffTables } from '@/lib/server/tables';
import { AdminTableManager } from './AdminTableManager';
import { AdminShiftsEditor } from './AdminShiftsEditor';
import { ReservationForm } from './ReservationForm';
import { DailyReservationsList } from './DailyReservationsList';
import { FormAlert } from '@/components/ui/form-error';
import { useServerForm } from '@/lib/forms';
import { toUserMessage } from '@/lib/errors';
import { useToast } from '@/components/ui/use-toast';
import type { ReservationStatus, RestaurantTable, Zone } from '@/lib/types';
import { 
  format, 
  addDays, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  isSameDay, 
  setHours, 
  setMinutes 
} from 'date-fns';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Users, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Plus, 
  Sliders, 
  Inbox, 
  Building2, 
  Trees, 
  Coffee,
  Phone,
  MessageSquare,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard
} from 'lucide-react';

const TIME_SLOT_MINUTES = 30;
const DAY_START_HOUR = 12;
const DAY_END_HOUR = 23;

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

const ZONES_CONFIG: { zone: Zone; label: string; hint: string; icon: any }[] = [
  { zone: 'INTERIOR', label: 'Interior', hint: 'Mesas y salón principal climatizado', icon: Building2 },
  { zone: 'TERRAZA', label: 'Terraza', hint: 'Mesas en área exterior y jardín', icon: Trees },
  { zone: 'BARRA', label: 'Barra', hint: 'Asientos y periqueras en barra', icon: Coffee },
];

export function AdminReservations({ localSlug }: { localSlug?: string } = {}) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'pending' | 'calendar' | 'tables' | 'shifts' | 'capacity'>('pending');
  const [calendarView, setCalendarView] = useState<'day' | 'week'>('day');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [reservations, setReservations] = useState<any[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [zoneCapacities, setZoneCapacities] = useState<Record<Zone, number>>({ INTERIOR: 0, TERRAZA: 0, BARRA: 0 });
  const [loading, setLoading] = useState(true);
  const [editingReservation, setEditingReservation] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [savingCapacity, setSavingCapacity] = useState<Zone | null>(null);
  const { formError, setFormError, submit } = useServerForm();

  // Cargar datos
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [caps, res, tbls] = await Promise.all([
        getZoneCapacities(),
        listReservations(
          format(addDays(selectedDate, -15), 'yyyy-MM-dd'),
          format(addDays(selectedDate, 30), 'yyyy-MM-dd')
        ),
        getStaffTables().catch(() => [] as RestaurantTable[]),
      ]);

      const capacities: Record<Zone, number> = { INTERIOR: 0, TERRAZA: 0, BARRA: 0 };
      caps.forEach((c: any) => {
        capacities[c.zone as Zone] = c.capacity;
      });

      setZoneCapacities(capacities);
      setReservations(res || []);
      setTables(tbls || []);
    } catch (err: any) {
      console.error('AdminReservations/loadData:', err);
      setFormError(toUserMessage(err, 'No se pudieron cargar las reservas del local.'));
    } finally {
      setLoading(false);
    }
  }, [selectedDate, setFormError]);

  const handleReassignTable = async (reservationId: string, tableId: string | null) => {
    try {
      await reassignReservationTable(reservationId, tableId);
      toast({ title: 'Mesa reasignada', description: 'Se actualizó la mesa de la reserva.' });
      await loadData();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'No se pudo reasignar la mesa', variant: 'destructive' });
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reservas pendientes de aprobación
  const pendingReservations = useMemo(() => {
    return reservations.filter((r) => r.status === 'PENDIENTE');
  }, [reservations]);

  // Reservas del día seleccionado
  const todayStr = format(selectedDate, 'yyyy-MM-dd');
  const todayReservations = useMemo(() => {
    return reservations.filter((r) => r.reservation_date === todayStr);
  }, [reservations, todayStr]);

  const confirmedToday = useMemo(() => {
    return todayReservations.filter((r) => r.status === 'CONFIRMADA');
  }, [todayReservations]);

  const totalGuestsToday = useMemo(() => {
    return confirmedToday.reduce((sum, r) => sum + (r.party_size || 0), 0);
  }, [confirmedToday]);

  const totalCapacity = useMemo(() => {
    return Object.values(zoneCapacities).reduce((a, b) => a + b, 0);
  }, [zoneCapacities]);

  // Acciones sobre reservas pendientes
  const handleAccept = async (id: string) => {
    const ok = await submit(async () => {
      await acceptReservation(id);
      toast({ title: 'Reserva aceptada', description: 'La reserva ha sido confirmada con éxito.' });
    });
    if (ok) await loadData();
  };

  const handleReject = async (id: string) => {
    const reason = window.prompt('Motivo de cancelación o rechazo (opcional):') ?? undefined;
    const ok = await submit(async () => {
      await rejectReservation(id, reason);
      toast({ title: 'Reserva rechazada', description: 'La solicitud se marcó como cancelada.' });
    });
    if (ok) await loadData();
  };

  // Guardar cambio de aforo por zona
  const handleSaveCapacity = async (zone: Zone, cap: number) => {
    setSavingCapacity(zone);
    try {
      await upsertZoneCapacity(zone, cap);
      toast({ 
        title: 'Aforo actualizado', 
        description: `Se actualizó la capacidad de ${zone.toLowerCase()} a ${cap} comensales.` 
      });
      await loadData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'No se pudo guardar el aforo.', variant: 'destructive' });
    } finally {
      setSavingCapacity(null);
    }
  };

  // Apertura de modal de reserva manual
  const handleNewReservation = () => {
    setEditingReservation(null);
    setShowForm(true);
  };

  const handleSubmitSuccess = async () => {
    setShowForm(false);
    setEditingReservation(null);
    await loadData();
  };

  // Navegación de fechas
  const handlePrevDay = () => setSelectedDate((d) => addDays(d, -1));
  const handleNextDay = () => setSelectedDate((d) => addDays(d, 1));
  const handleToday = () => setSelectedDate(new Date());

  // Generar franjas horarias
  const timeSlots = useMemo(() => {
    const slots = [];
    let current = setHours(setMinutes(new Date(), 0), DAY_START_HOUR);
    const end = setHours(setMinutes(new Date(), 0), DAY_END_HOUR);
    while (current <= end) {
      slots.push(new Date(current));
      current = addMinutes(current, TIME_SLOT_MINUTES);
    }
    return slots;
  }, []);

  if (loading && reservations.length === 0) {
    return (
      <div className="py-16 text-center text-zinc-500 flex items-center justify-center gap-3">
        <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        Cargando reservas y configuración de aforo…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FormAlert message={formError} />

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Pendientes */}
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`p-5 rounded-2xl border text-left transition-all cursor-pointer ${
            activeTab === 'pending'
              ? 'bg-amber-50/70 border-amber-300 ring-2 ring-amber-400'
              : 'bg-white border-zinc-200/80 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
              Por Confirmar
            </span>
            <span className={`w-2.5 h-2.5 rounded-full ${pendingReservations.length > 0 ? 'bg-amber-500 animate-ping' : 'bg-zinc-300'}`} />
          </div>
          <div className="text-2xl font-extrabold text-zinc-900 mt-2">
            {pendingReservations.length}
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            {pendingReservations.length === 1 ? '1 solicitud pendiente' : `${pendingReservations.length} solicitudes pendientes`}
          </p>
        </button>

        {/* Card 2: Confirmadas hoy */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('calendar');
            setSelectedDate(new Date());
          }}
          className={`p-5 rounded-2xl border text-left transition-all cursor-pointer ${
            activeTab === 'calendar'
              ? 'bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-400'
              : 'bg-white border-zinc-200/80 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
              Confirmadas Hoy
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-zinc-900 mt-2">
            {confirmedToday.length}
          </div>
          <p className="text-xs text-zinc-500 mt-1">Para el servicio de hoy</p>
        </button>

        {/* Card 3: Comensales esperados */}
        <div className="p-5 rounded-2xl border border-zinc-200/80 bg-white">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
              Comensales Hoy
            </span>
            <Users className="w-4 h-4 text-orange-500" />
          </div>
          <div className="text-2xl font-extrabold text-zinc-900 mt-2">
            {totalGuestsToday}
          </div>
          <p className="text-xs text-zinc-500 mt-1">Personas esperadas hoy</p>
        </div>

        {/* Card 4: Aforo Total */}
        <button
          type="button"
          onClick={() => setActiveTab('capacity')}
          className={`p-5 rounded-2xl border text-left transition-all cursor-pointer ${
            activeTab === 'capacity'
              ? 'bg-blue-50/70 border-blue-300 ring-2 ring-blue-400'
              : 'bg-white border-zinc-200/80 hover:border-blue-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-800">
              Aforo Total Mesas
            </span>
            <Sliders className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-extrabold text-zinc-900 mt-2">
            {totalCapacity} <span className="text-sm font-normal text-zinc-500">lugares</span>
          </div>
          <p className="text-xs text-zinc-500 mt-1">Configuración del local</p>
        </button>
      </div>

      {/* Barra de Navegación de Secciones */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 pb-4">
        <nav className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'pending'
                ? 'bg-zinc-900 text-white shadow-md'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            <Inbox className="w-4 h-4" />
            <span>Pendientes</span>
            {pendingReservations.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500 text-white font-extrabold animate-pulse">
                {pendingReservations.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('calendar')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'calendar'
                ? 'bg-zinc-900 text-white shadow-md'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            <CalendarIcon className="w-4 h-4" />
            <span>Agenda / Calendario</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tables')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'tables'
                ? 'bg-zinc-900 text-white shadow-md'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 text-emerald-500" />
            <span>Sala y Mesas (Hostess & QR)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('shifts')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'shifts'
                ? 'bg-zinc-900 text-white shadow-md'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            <Clock className="w-4 h-4 text-orange-500" />
            <span>Turnos y Horarios</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('capacity')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'capacity'
                ? 'bg-zinc-900 text-white shadow-md'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Aforo Global</span>
          </button>
        </nav>

        <button
          type="button"
          onClick={handleNewReservation}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold shadow-md shadow-orange-600/20 transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nueva Reserva Manual
        </button>
      </div>

      {/* PESTAÑA 1: BANDEJA DE PENDIENTES */}
      {activeTab === 'pending' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-zinc-900">Solicitudes Web Pendientes</h2>
              <p className="text-xs text-zinc-500">
                Reservaciones realizadas por clientes en el frontend que requieren aceptación o rechazo.
              </p>
            </div>
            <button
              type="button"
              onClick={loadData}
              className="text-xs font-semibold text-orange-600 hover:text-orange-700 underline"
            >
              Actualizar lista
            </button>
          </div>

          {pendingReservations.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-zinc-200/80 shadow-sm p-8">
              <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-zinc-900">¡Bandeja al día!</h3>
              <p className="text-sm text-zinc-500 max-w-md mx-auto mt-1">
                No tienes reservaciones pendientes de confirmación. Todas las solicitudes han sido gestionadas.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingReservations.map((res) => {
                const cleanPhone = (res.holder_phone || '').replace(/\D/g, '');
                const waLink = cleanPhone.length === 10 ? `https://wa.me/52${cleanPhone}` : `https://wa.me/${cleanPhone}`;

                return (
                  <div
                    key={res.id}
                    className="bg-white border-2 border-amber-300 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <span className="text-xs font-semibold uppercase text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                            Pendiente
                          </span>
                          <h3 className="text-base font-extrabold text-zinc-900 mt-1">
                            {res.holder_name}
                          </h3>
                        </div>
                        <span className="text-sm font-extrabold text-orange-600 bg-orange-50 px-2.5 py-1 rounded-lg border border-orange-200">
                          {res.party_size} {res.party_size === 1 ? 'comensal' : 'comensales'}
                        </span>
                      </div>

                      <div className="space-y-2 py-2 border-y border-zinc-100 text-xs text-zinc-600">
                        <div className="flex items-center gap-2">
                          <CalendarIcon className="w-3.5 h-3.5 text-zinc-400" />
                          <span className="font-semibold text-zinc-800">{res.reservation_date}</span>
                          <Clock className="w-3.5 h-3.5 text-zinc-400 ml-2" />
                          <span className="font-semibold text-zinc-800">{res.reservation_time} hrs</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-zinc-400" />
                          <span>Zona solicitada:</span>
                          <strong className="text-zinc-900">
                            {res.preferred_zone === 'INTERIOR' ? 'Interior' : res.preferred_zone === 'TERRAZA' ? 'Terraza' : 'Barra'}
                          </strong>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span className="text-zinc-500 font-semibold">Mesa asignada:</span>
                          <select
                            value={res.table_id || ''}
                            onChange={(e) => handleReassignTable(res.id, e.target.value || null)}
                            className="rounded-lg border border-zinc-300 text-[11px] font-bold text-zinc-800 p-1 bg-zinc-50"
                          >
                            <option value="">(Sin mesa asignada)</option>
                            {tables
                              .filter((t) => t.zone === res.preferred_zone)
                              .map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.table_number} ({t.min_capacity}–{t.max_capacity} pax)
                                </option>
                              ))}
                          </select>
                        </div>

                        <div className="flex items-center gap-3 pt-1">
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
                              className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-bold"
                            >
                              <ExternalLink className="w-3 h-3" />
                              WhatsApp
                            </a>
                          )}
                        </div>

                        {res.notes && (
                          <div className="p-2 bg-amber-50/60 rounded-lg text-zinc-700 italic border border-amber-200/50 mt-2">
                            "{res.notes}"
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-4">
                      <button
                        type="button"
                        onClick={() => handleAccept(res.id)}
                        className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Aceptar Mesa
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReject(res.id)}
                        className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 transition-all cursor-pointer"
                      >
                        <XCircle className="w-4 h-4" />
                        Rechazar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* PESTAÑA 2: AGENDA Y CALENDARIO */}
      {activeTab === 'calendar' && (
        <div className="space-y-4">
          {/* Navegación del Calendario */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePrevDay}
                  className="w-9 h-9 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 flex items-center justify-center transition cursor-pointer"
                  title="Día anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleToday}
                  className="px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold transition cursor-pointer"
                >
                  Hoy
                </button>
                <button
                  type="button"
                  onClick={handleNextDay}
                  className="w-9 h-9 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 flex items-center justify-center transition cursor-pointer"
                  title="Día siguiente"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-orange-600" />
                <span className="text-base font-extrabold text-zinc-900 capitalize">
                  {format(selectedDate, 'EEEE, d MMMM yyyy')}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={format(selectedDate, 'yyyy-MM-dd')}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(new Date(`${e.target.value}T12:00:00`));
                }}
                className="bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-1.5 text-xs font-semibold text-zinc-800 cursor-pointer"
              />
            </div>
          </div>

          {/* Lista de reservas del día */}
          <DailyReservationsList
            reservations={reservations}
            selectedDate={selectedDate}
            onUpdate={loadData}
          />
        </div>
      )}

      {/* PESTAÑA: SALA Y MESAS (HOSTESS & QR) */}
      {activeTab === 'tables' && (
        <AdminTableManager localSlug={localSlug} />
      )}

      {/* PESTAÑA: TURNOS Y HORARIOS */}
      {activeTab === 'shifts' && (
        <AdminShiftsEditor />
      )}

      {/* PESTAÑA: GESTIÓN DE AFORO GLOBAL */}
      {activeTab === 'capacity' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-zinc-200/80 shadow-sm space-y-6">
            <div className="border-b border-zinc-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-zinc-900">
                    Aforo de Mesas por Zona (Sucursal Actual)
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Define la capacidad máxima de comensales en simultáneo para cada ambiente de este restaurante.
                    El frontend del cliente validará estas cifras automáticamente en cada reservación.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {ZONES_CONFIG.map(({ zone, label, hint, icon: Icon }) => {
                const currentCap = zoneCapacities[zone] || 0;
                const isSaving = savingCapacity === zone;

                return (
                  <div
                    key={zone}
                    className="p-5 rounded-2xl border border-zinc-200/80 bg-zinc-50/50 space-y-4 hover:border-orange-300 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white border border-zinc-200 text-zinc-800 flex items-center justify-center shadow-sm">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-sm text-zinc-900">{label}</h3>
                        <p className="text-[11px] text-zinc-500">{hint}</p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Aforo comensales (0 = inactivo)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="500"
                          value={currentCap}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10) || 0;
                            setZoneCapacities((prev) => ({ ...prev, [zone]: val }));
                          }}
                          className="w-full bg-white border border-zinc-300 rounded-xl px-3 py-2 text-sm font-bold text-zinc-900 focus:ring-2 focus:ring-orange-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleSaveCapacity(zone, currentCap)}
                          className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold transition disabled:opacity-50 cursor-pointer shrink-0"
                        >
                          {isSaving ? 'Guardando…' : 'Guardar'}
                        </button>
                      </div>
                    </div>

                    <div className="pt-2 text-[11px] text-zinc-500 flex items-center justify-between border-t border-zinc-200/60">
                      <span>Estado:</span>
                      <strong className={currentCap > 0 ? 'text-emerald-600' : 'text-zinc-400'}>
                        {currentCap > 0 ? `${currentCap} lugares disponibles` : 'Zona Desactivada'}
                      </strong>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 bg-orange-50/60 rounded-2xl border border-orange-200/60 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
              <div className="text-xs text-orange-900 leading-relaxed">
                <strong>¿Cómo funciona el aforo en las reservas?</strong> Cuando un comensal solicita una mesa desde la web, el sistema suma las reservas activas (pendientes y confirmadas) para esa fecha y hora. Si la suma supera la capacidad que configuraste aquí, esa franja horaria se bloquea automáticamente al cliente, evitando cualquier sobreventa.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Formulario de Reserva Manual */}
      {showForm && (
        <ReservationForm
          reservation={editingReservation}
          onSuccess={handleSubmitSuccess}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
