'use client';

import { useState, useEffect, useCallback, useMemo, useTransition } from 'react';
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
import { toggleLocalReservationsEnabled } from '@/lib/server/locals';
import { getStaffTables } from '@/lib/server/tables';
import { AdminTableManager } from './AdminTableManager';
import { AdminShiftsEditor } from './AdminShiftsEditor';
import { ReservationForm } from './ReservationForm';
import { DailyReservationsList } from './DailyReservationsList';
import { FormAlert } from '@/components/ui/form-error';
import { useServerForm } from '@/lib/forms';
import { toUserMessage } from '@/lib/errors';
import { useToast } from '@/components/ui/use-toast';
import type { ReservationStatus, RestaurantTable, Zone, Local } from '@/lib/types';
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
  LayoutDashboard,
  RefreshCw
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

import { AdminWaitlistManager } from './AdminWaitlistManager';
import { listActiveWaitlist } from '@/lib/server/waitlist';
import type { WaitlistParty } from '@/lib/types';

interface AdminReservationsProps {
  localSlug?: string;
  local?: Local | null;
}

export function AdminReservations({ localSlug, local }: AdminReservationsProps = {}) {
  const { toast } = useToast();
  const [isPendingReservationsToggle, startTransitionReservationsToggle] = useTransition();
  const [reservationsEnabled, setReservationsEnabled] = useState(local?.reservations_enabled !== false);
  const [activeTab, setActiveTab] = useState<'pending' | 'waitlist' | 'calendar' | 'tables' | 'shifts'>('pending');
  const [calendarView, setCalendarView] = useState<'day' | 'week'>('day');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [reservations, setReservations] = useState<any[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistParty[]>([]);
  const [zoneCapacities, setZoneCapacities] = useState<Record<Zone, number>>({ INTERIOR: 0, TERRAZA: 0, BARRA: 0 });
  const [loading, setLoading] = useState(true);
  const [editingReservation, setEditingReservation] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const { formError, setFormError, submit } = useServerForm();

  const handleToggleReservations = () => {
    if (!local?.id) return;
    const nextState = !reservationsEnabled;
    startTransitionReservationsToggle(async () => {
      try {
        await toggleLocalReservationsEnabled(local.id, nextState);
        setReservationsEnabled(nextState);
        toast({
          title: nextState ? 'Reservaciones habilitadas' : 'Reservaciones pausadas',
          description: nextState
            ? 'Los clientes ahora pueden reservar mesas desde el portal y menú público.'
            : 'Las reservaciones en línea han sido pausadas para esta sucursal.',
        });
      } catch (err: any) {
        toast({
          title: 'Error al cambiar estado de reservaciones',
          description: err?.message || 'No se pudo actualizar el estado.',
          variant: 'destructive',
        });
      }
    });
  };

  // Cargar datos
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [caps, res, tbls, wl] = await Promise.all([
        getZoneCapacities(),
        listReservations(
          format(addDays(selectedDate, -15), 'yyyy-MM-dd'),
          format(addDays(selectedDate, 30), 'yyyy-MM-dd')
        ),
        getStaffTables().catch(() => [] as RestaurantTable[]),
        listActiveWaitlist().catch(() => [] as WaitlistParty[]),
      ]);

      const capacities: Record<Zone, number> = { INTERIOR: 0, TERRAZA: 0, BARRA: 0 };
      caps.forEach((c: any) => {
        capacities[c.zone as Zone] = c.capacity;
      });

      setZoneCapacities(capacities);
      setReservations(res || []);
      setTables(tbls || []);
      setWaitlist(wl || []);
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

  // Aforo total calculado dinámicamente desde las mesas físicas activas
  const totalCapacity = useMemo(() => {
    return tables.filter((t) => t.is_active).reduce((sum, t) => sum + (t.max_capacity || 0), 0);
  }, [tables]);

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

      {/* Banner de Estado de Reservas */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-white rounded-2xl border border-zinc-200/80 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-xl ${reservationsEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
            <CalendarIcon className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-900">
                {reservationsEnabled ? 'Reservaciones en Línea Activas' : 'Reservaciones en Línea Pausadas'}
              </span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                reservationsEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}>
                {reservationsEnabled ? 'Habilitado' : 'Pausado'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              {reservationsEnabled
                ? 'Los clientes pueden ingresar a /reservar y solicitar mesas en los horarios configurados.'
                : 'El portal de reservas está temporalmente desactivado para clientes. Las solicitudes existentes se mantienen.'}
            </p>
          </div>
        </div>

        {local && (
          <button
            type="button"
            onClick={handleToggleReservations}
            disabled={isPendingReservationsToggle}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50 ${
              reservationsEnabled
                ? 'bg-zinc-800 hover:bg-zinc-900 text-zinc-100'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            {isPendingReservationsToggle ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : reservationsEnabled ? (
              <XCircle className="w-3.5 h-3.5 text-rose-400" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
            <span>
              {reservationsEnabled ? 'Desactivar reservas públicas' : 'Habilitar reservas públicas'}
            </span>
          </button>
        )}
      </div>

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

        {/* Card 4: Aforo Total Mesas (Calculado de mesas físicas) */}
        <button
          type="button"
          onClick={() => setActiveTab('tables')}
          className={`p-5 rounded-2xl border text-left transition-all cursor-pointer ${
            activeTab === 'tables'
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
          <p className="text-xs text-zinc-500 mt-1">Calculado de mesas activas</p>
        </button>
      </div>

      {/* Barra de Navegación de Secciones */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200 pb-3">
        <div className="relative -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto no-scrollbar">
          <nav className="flex items-center gap-1.5 py-1">
            <button
              type="button"
              onClick={() => setActiveTab('pending')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 min-h-[44px] rounded-xl text-xs sm:text-sm font-bold shrink-0 whitespace-nowrap transition-all select-none cursor-pointer active:scale-95 ${
                activeTab === 'pending'
                  ? 'bg-zinc-900 text-white shadow-md'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              <Inbox className="w-4 h-4 shrink-0" />
              <span>Pendientes Web</span>
              {pendingReservations.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-amber-500 text-white font-extrabold animate-pulse">
                  {pendingReservations.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('waitlist')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 min-h-[44px] rounded-xl text-xs sm:text-sm font-bold shrink-0 whitespace-nowrap transition-all select-none cursor-pointer active:scale-95 ${
                activeTab === 'waitlist'
                  ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              <Users className="w-4 h-4 shrink-0 text-orange-400" />
              <span>Fila en Puerta (Waitlist)</span>
              {waitlist.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-orange-500 text-white font-extrabold animate-pulse">
                  {waitlist.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('calendar')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 min-h-[44px] rounded-xl text-xs sm:text-sm font-bold shrink-0 whitespace-nowrap transition-all select-none cursor-pointer active:scale-95 ${
                activeTab === 'calendar'
                  ? 'bg-zinc-900 text-white shadow-md'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              <CalendarIcon className="w-4 h-4 shrink-0" />
              <span>Agenda / Calendario</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('tables')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 min-h-[44px] rounded-xl text-xs sm:text-sm font-bold shrink-0 whitespace-nowrap transition-all select-none cursor-pointer active:scale-95 ${
                activeTab === 'tables'
                  ? 'bg-zinc-900 text-white shadow-md'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 shrink-0 text-emerald-500" />
              <span>Sala y Mesas (Hostess & QR)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('shifts')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 min-h-[44px] rounded-xl text-xs sm:text-sm font-bold shrink-0 whitespace-nowrap transition-all select-none cursor-pointer active:scale-95 ${
                activeTab === 'shifts'
                  ? 'bg-zinc-900 text-white shadow-md'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              <Clock className="w-4 h-4 shrink-0 text-orange-500" />
              <span>Turnos y Horarios</span>
            </button>
          </nav>
        </div>

        <button
          type="button"
          onClick={handleNewReservation}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs sm:text-sm font-bold shadow-md shadow-orange-600/20 transition-all select-none cursor-pointer shrink-0 active:scale-95 w-full sm:w-auto"
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
                          {Array.isArray(res.table_ids) && res.table_ids.length > 1 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-black bg-orange-100 text-orange-900 border border-orange-200">
                              {tables.filter((t) => res.table_ids.includes(t.id)).map((t) => t.table_number).join(' + ')} (Unidas)
                            </span>
                          ) : (
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
                          )}
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

      {/* PESTAÑA: FILA DE ESPERA VIRTUAL (WAITLIST) */}
      {activeTab === 'waitlist' && (
        <AdminWaitlistManager
          waitlist={waitlist}
          tables={tables}
          localSlug={localSlug}
          onRefresh={loadData}
        />
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
            tables={tables}
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

      {/* Modal de Formulario de Reserva Manual */}
      {showForm && (
        <ReservationForm
          reservation={editingReservation}
          tables={tables}
          onSuccess={handleSubmitSuccess}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
