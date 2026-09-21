'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import Link from 'next/link';
import { 
  UtensilsCrossed, 
  Calendar as CalendarIcon, 
  Clock, 
  Users, 
  MapPin, 
  ChevronRight, 
  ArrowLeft, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles,
  Phone,
  User,
  MessageSquare,
  ShieldCheck,
  Building2,
  Trees,
  Coffee,
  Check
} from 'lucide-react';
import type { LocalInfo } from '@/lib/server/local';
import type { Zone, SlotAvailability, Reservation } from '@/lib/types';
import { getPublicAvailability, createPublicReservation } from '@/lib/server/reservations';
import { FormAlert, FieldError, fieldAria } from '@/components/ui/form-error';

interface Props {
  local: LocalInfo;
  zones: Array<{
    zone: Zone;
    capacity: number;
    label: string;
    description: string;
  }>;
}

export default function ReservationClient({ local, zones }: Props) {
  // Estado del formulario
  const [partySize, setPartySize] = useState<number>(2);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().slice(0, 10);
  });
  const [selectedZone, setSelectedZone] = useState<Zone>(() => {
    return zones.length > 0 ? zones[0].zone : 'INTERIOR';
  });
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [holderName, setHolderName] = useState<string>('');
  const [holderPhone, setHolderPhone] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Estados de carga y disponibilidad
  const [slots, setSlots] = useState<SlotAvailability[]>([]);
  const [loadingSlots, setLoadingSlots] = useState<boolean>(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  // Estado de éxito
  const [confirmedReservation, setConfirmedReservation] = useState<{
    reservation: Reservation;
    folio: string;
  } | null>(null);

  // Fecha mínima (hoy) y máxima (30 días en el futuro)
  const todayStr = new Date().toISOString().slice(0, 10);
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 30);
  const maxDateStr = maxDate.toISOString().slice(0, 10);

  // Cargar disponibilidad de horarios para la fecha y comensales
  const fetchAvailability = useCallback(async (date: string, size: number) => {
    setLoadingSlots(true);
    setFormError(null);
    try {
      const res = await getPublicAvailability(local.slug, date, size);
      if (res.ok) {
        setSlots(res.slots);
        // Si la hora seleccionada ya no es válida para la nueva fecha/comensales, limpiarla
        setSelectedTime((prevTime) => {
          if (!prevTime) return '';
          const slot = res.slots.find((s) => s.time === prevTime);
          const zoneInfo = slot?.zones[selectedZone];
          return zoneInfo && zoneInfo.canBook ? prevTime : '';
        });
      } else {
        setFormError(res.error || 'No se pudo verificar la disponibilidad.');
      }
    } catch {
      setFormError('Error de red al consultar disponibilidad. Intenta nuevamente.');
    } finally {
      setLoadingSlots(false);
    }
  }, [local.slug, selectedZone]);

  useEffect(() => {
    fetchAvailability(selectedDate, partySize);
  }, [selectedDate, partySize, fetchAvailability]);

  // Selección rápida de fechas
  const setQuickDate = (daysAhead: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  // Manejo del submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const errors: Record<string, string> = {};

    if (!holderName.trim() || holderName.trim().length < 2) {
      errors.holderName = 'Ingresa el nombre completo del titular (mínimo 2 letras)';
    }

    const cleanPhone = holderPhone.replace(/[\s\-()]/g, '');
    if (!cleanPhone || cleanPhone.length < 8 || cleanPhone.length > 16) {
      errors.holderPhone = 'Ingresa un teléfono válido de contacto (8 a 16 dígitos)';
    }

    if (!selectedTime) {
      errors.selectedTime = 'Por favor selecciona un horario para tu reserva';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});

    startTransition(async () => {
      try {
        const res = await createPublicReservation({
          location_slug: local.slug,
          holder_name: holderName,
          holder_phone: holderPhone,
          reservation_date: selectedDate,
          reservation_time: selectedTime,
          party_size: partySize,
          preferred_zone: selectedZone,
          table_id: selectedTableId || undefined,
          notes: notes.trim() || undefined,
        });

        if (res.ok && res.reservation && res.folio) {
          setConfirmedReservation({
            reservation: res.reservation,
            folio: res.folio,
          });
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          setFormError(res.error || 'No se pudo procesar la reserva. Por favor revisa los datos.');
        }
      } catch (err: any) {
        setFormError(err.message || 'Ocurrió un error inesperado. Inténtalo de nuevo.');
      }
    });
  };

  // Si ya se confirmó la reserva con éxito, mostrar la vista de confirmación
  if (confirmedReservation) {
    const { reservation, folio } = confirmedReservation;
    return (
      <main className="min-h-screen bg-gradient-to-b from-orange-50/40 via-zinc-50 to-white py-12 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-3xl shadow-xl shadow-orange-950/5 border border-orange-100 overflow-hidden">
            {/* Cabecera verde de éxito */}
            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-8 text-center text-white relative">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mx-auto mb-4 ring-4 ring-white/30 shadow-inner">
                <CheckCircle2 className="w-10 h-10 text-white" />
              </div>
              <span className="inline-block px-3 py-1 bg-white/20 rounded-full text-xs font-semibold uppercase tracking-wider mb-2">
                Solicitud Registrada
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                ¡Tu mesa está en proceso de reserva!
              </h1>
              <p className="text-emerald-100 text-sm mt-2">
                Folio de seguimiento:{' '}
                <span className="font-mono font-bold text-white bg-white/20 px-2 py-0.5 rounded">
                  #{folio}
                </span>
              </p>
            </div>

            {/* Detalles de la reserva */}
            <div className="p-6 sm:p-8 space-y-6">
              {/* Badge de estado Pendiente */}
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200/80 rounded-2xl">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-bold text-amber-900">Estado: Pendiente de Confirmación</p>
                  <p className="text-amber-700 mt-0.5">
                    El equipo de <strong>{local.name}</strong> revisará la disponibilidad y te enviará la confirmación vía WhatsApp o llamada telefónica al <strong>{reservation.holder_phone}</strong>.
                  </p>
                </div>
              </div>

              {/* Ficha técnica */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-zinc-50/80 border border-zinc-200/80 rounded-2xl p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                    <CalendarIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs text-zinc-400 font-medium uppercase">Fecha</span>
                    <p className="text-sm font-bold text-zinc-900">{reservation.reservation_date}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs text-zinc-400 font-medium uppercase">Hora</span>
                    <p className="text-sm font-bold text-zinc-900">{reservation.reservation_time} hrs</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs text-zinc-400 font-medium uppercase">Comensales</span>
                    <p className="text-sm font-bold text-zinc-900">{reservation.party_size} personas</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs text-zinc-400 font-medium uppercase">Zona</span>
                    <p className="text-sm font-bold text-zinc-900">
                      {reservation.preferred_zone === 'INTERIOR' ? 'Interior' : 
                       reservation.preferred_zone === 'TERRAZA' ? 'Terraza' : 'Barra'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:col-span-2 pt-2 border-t border-zinc-200/60">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs text-zinc-400 font-medium uppercase">Titular</span>
                    <p className="text-sm font-bold text-zinc-900">{reservation.holder_name}</p>
                  </div>
                </div>

                {reservation.notes && (
                  <div className="sm:col-span-2 pt-2 border-t border-zinc-200/60">
                    <span className="text-xs text-zinc-400 font-medium uppercase">Peticiones especiales</span>
                    <p className="text-sm text-zinc-700 italic mt-0.5">"{reservation.notes}"</p>
                  </div>
                )}
              </div>

              {/* Botones de acción */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <Link
                  href={`/${local.slug}`}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold shadow-md shadow-orange-600/20 transition-all cursor-pointer"
                >
                  <UtensilsCrossed className="w-4 h-4" />
                  Ver Menú y Carta
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmedReservation(null);
                    setHolderName('');
                    setHolderPhone('');
                    setNotes('');
                    setSelectedTime('');
                  }}
                  className="inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-sm font-bold transition-all cursor-pointer"
                >
                  Hacer otra reserva
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Zona activa actualmente seleccionada
  const activeZoneConfig = zones.find((z) => z.zone === selectedZone);

  return (
    <main className="min-h-screen bg-[#FBFBFB] text-zinc-900 pb-20">
      {/* Header superior */}
      <header className="bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-950 text-white border-b border-zinc-800 py-6 px-4 sm:px-8">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href={`/${local.slug}`}
              className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
              title="Volver al menú"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  Reserva tu mesa en {local.name}
                </h1>
              </div>
              {local.address && (
                <p className="text-xs sm:text-sm text-zinc-400 flex items-center gap-1.5 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  {local.address}
                </p>
              )}
            </div>
          </div>

          <Link
            href={`/${local.slug}`}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-600/90 hover:bg-orange-600 text-white text-xs font-semibold shadow-md transition-all self-start sm:self-auto cursor-pointer"
          >
            <UtensilsCrossed className="w-3.5 h-3.5" />
            Ver la carta
          </Link>
        </div>
      </header>

      {/* Contenedor del Formulario */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-8">
        <FormAlert message={formError} />

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* PASO 1: Comensales y Fecha */}
          <section className="bg-white rounded-3xl p-6 sm:p-8 border border-zinc-200/80 shadow-sm space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b border-zinc-100">
              <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-sm">
                1
              </div>
              <div>
                <h2 className="text-lg font-bold text-zinc-900">Comensales y Fecha</h2>
                <p className="text-xs text-zinc-500">Elige para cuántas personas y qué día deseas reservar</p>
              </div>
            </div>

            {/* Selector de comensales */}
            <div>
              <label className="block text-sm font-semibold text-zinc-800 mb-3">
                ¿Cuántos comensales asistirán?
              </label>
              <div className="flex flex-wrap gap-2.5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setPartySize(num)}
                    className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                      partySize === num
                        ? 'bg-orange-600 text-white shadow-md shadow-orange-600/25 ring-2 ring-orange-600/50'
                        : 'bg-zinc-50 text-zinc-700 hover:bg-zinc-100 border border-zinc-200/80'
                    }`}
                  >
                    {num} {num === 1 ? 'persona' : 'personas'}
                  </button>
                ))}
              </div>
            </div>

            {/* Selector de fecha */}
            <div>
              <label className="block text-sm font-semibold text-zinc-800 mb-3">
                Fecha de la reserva
              </label>

              {/* Botones rápidos */}
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setQuickDate(0)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    selectedDate === todayStr
                      ? 'bg-zinc-900 text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  Hoy
                </button>
                <button
                  type="button"
                  onClick={() => setQuickDate(1)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-all cursor-pointer"
                >
                  Mañana
                </button>
                <button
                  type="button"
                  onClick={() => setQuickDate(2)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-all cursor-pointer"
                >
                  Pasado mañana
                </button>
              </div>

              <div className="relative max-w-xs">
                <input
                  type="date"
                  min={todayStr}
                  max={maxDateStr}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all cursor-pointer"
                  required
                />
              </div>
            </div>
          </section>

          {/* PASO 2: Zona y Horario */}
          <section className="bg-white rounded-3xl p-6 sm:p-8 border border-zinc-200/80 shadow-sm space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b border-zinc-100">
              <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-sm">
                2
              </div>
              <div>
                <h2 className="text-lg font-bold text-zinc-900">Zona y Horario</h2>
                <p className="text-xs text-zinc-500">Selecciona el ambiente de tu preferencia y la hora</p>
              </div>
            </div>

            {/* Selector de Zona */}
            <div>
              <label className="block text-sm font-semibold text-zinc-800 mb-3">
                Ambiente o zona de preferencia
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {zones.map((z) => {
                  const isSelected = selectedZone === z.zone;
                  const Icon = z.zone === 'INTERIOR' ? Building2 : z.zone === 'TERRAZA' ? Trees : Coffee;
                  return (
                    <button
                      key={z.zone}
                      type="button"
                      onClick={() => setSelectedZone(z.zone)}
                      className={`p-4 rounded-2xl text-left border transition-all cursor-pointer relative overflow-hidden ${
                        isSelected
                          ? 'border-orange-500 bg-orange-50/40 shadow-sm ring-1 ring-orange-500'
                          : 'border-zinc-200/80 bg-white hover:bg-zinc-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                          isSelected ? 'bg-orange-600 text-white' : 'bg-zinc-100 text-zinc-600'
                        }`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        {isSelected && (
                          <span className="w-5 h-5 rounded-full bg-orange-600 text-white flex items-center justify-center">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                      <p className="font-bold text-sm text-zinc-900">{z.label}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{z.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selector de Horarios */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold text-zinc-800">
                  Horarios disponibles para {activeZoneConfig?.label || 'esta zona'}
                </label>
                {selectedTime && (
                  <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200">
                    Hora seleccionada: {selectedTime} hrs
                  </span>
                )}
              </div>

              {loadingSlots ? (
                <div className="py-8 text-center text-zinc-400 text-sm flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                  Calculando disponibilidad de aforo…
                </div>
              ) : slots.length === 0 ? (
                <p className="text-sm text-zinc-500 py-4">No hay franjas configuradas para esta sucursal.</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                    {slots.map((slot) => {
                      const zoneInfo = slot.zones[selectedZone];
                      const canBook = zoneInfo?.canBook ?? false;
                      const isSelected = selectedTime === slot.time;

                      return (
                        <button
                          key={slot.time}
                          type="button"
                          disabled={!canBook}
                          onClick={() => {
                            setSelectedTime(slot.time);
                            if (fieldErrors.selectedTime) {
                              setFieldErrors((prev) => {
                                const { selectedTime: _, ...rest } = prev;
                                return rest;
                              });
                            }
                          }}
                          className={`py-3 px-2 rounded-xl text-center font-bold text-sm transition-all relative ${
                            !canBook
                              ? 'bg-zinc-100 text-zinc-400 border border-dashed border-zinc-200 cursor-not-allowed opacity-50'
                              : isSelected
                              ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30 ring-2 ring-orange-600 scale-[1.02] cursor-pointer'
                              : 'bg-zinc-50 text-zinc-800 border border-zinc-200/80 hover:bg-orange-50 hover:border-orange-200 cursor-pointer'
                          }`}
                        >
                          <div>{slot.time}</div>
                          {canBook ? (
                            <div className={`text-[10px] mt-0.5 ${isSelected ? 'text-orange-100' : 'text-emerald-600 font-medium'}`}>
                              {zoneInfo.available <= 4 ? 'Últimos lugares' : 'Disponible'}
                            </div>
                          ) : (
                            <div className="text-[10px] mt-0.5 text-zinc-400">
                              Lleno
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <FieldError id="res-time-error" message={fieldErrors.selectedTime} />

                  {/* Selector de Mesas Disponibles */}
                  {selectedTime && (() => {
                    const selectedSlotObj = slots.find((s) => s.time === selectedTime);
                    const availableTables = selectedSlotObj?.zones[selectedZone]?.availableTables || [];
                    if (availableTables.length === 0) return null;

                    return (
                      <div className="mt-5 pt-4 border-t border-zinc-200/80 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-extrabold text-zinc-800 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                            Elige tu mesa en {activeZoneConfig?.label} (opcional)
                          </label>
                          <span className="text-[11px] text-zinc-400">
                            {availableTables.length} mesa(s) libre(s)
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          <button
                            type="button"
                            onClick={() => setSelectedTableId(null)}
                            className={`p-3 rounded-2xl text-left border text-xs font-bold transition-all cursor-pointer ${
                              selectedTableId === null
                                ? 'border-orange-500 bg-orange-50/80 text-orange-950 ring-2 ring-orange-500/20 shadow-sm'
                                : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100'
                            }`}
                          >
                            <div className="font-extrabold">Cualquiera disponible</div>
                            <div className="text-[10px] text-zinc-500 font-normal mt-0.5">Asignación automática</div>
                          </button>

                          {availableTables.map((tbl) => (
                            <button
                              key={tbl.id}
                              type="button"
                              onClick={() => setSelectedTableId(tbl.id)}
                              className={`p-3 rounded-2xl text-left border text-xs font-bold transition-all cursor-pointer ${
                                selectedTableId === tbl.id
                                  ? 'border-orange-500 bg-orange-50/80 text-orange-950 ring-2 ring-orange-500/20 shadow-sm'
                                  : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100'
                              }`}
                            >
                              <div className="font-extrabold text-zinc-900">{tbl.table_number}</div>
                              <div className="text-[10px] text-zinc-500 font-normal mt-0.5">
                                Capacidad: {tbl.min_capacity} a {tbl.max_capacity} pers.
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </section>

          {/* PASO 3: Datos de Contacto y Notas */}
          <section className="bg-white rounded-3xl p-6 sm:p-8 border border-zinc-200/80 shadow-sm space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b border-zinc-100">
              <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-sm">
                3
              </div>
              <div>
                <h2 className="text-lg font-bold text-zinc-900">Datos de Contacto</h2>
                <p className="text-xs text-zinc-500">¿A nombre de quién registramos la reservación?</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-zinc-800 mb-1.5">
                  Nombre completo *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={holderName}
                    onChange={(e) => {
                      setHolderName(e.target.value);
                      if (fieldErrors.holderName) {
                        setFieldErrors((prev) => {
                          const { holderName: _, ...rest } = prev;
                          return rest;
                        });
                      }
                    }}
                    placeholder="Ej. Sofía Martínez"
                    className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all"
                    required
                    {...fieldAria('res-name-error', !!fieldErrors.holderName)}
                  />
                </div>
                <FieldError id="res-name-error" message={fieldErrors.holderName} />
              </div>

              <div>
                <label className="block text-sm font-semibold text-zinc-800 mb-1.5">
                  Teléfono / WhatsApp *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                    <Phone className="w-4 h-4" />
                  </div>
                  <input
                    type="tel"
                    value={holderPhone}
                    onChange={(e) => {
                      setHolderPhone(e.target.value);
                      if (fieldErrors.holderPhone) {
                        setFieldErrors((prev) => {
                          const { holderPhone: _, ...rest } = prev;
                          return rest;
                        });
                      }
                    }}
                    placeholder="Ej. 5512345678"
                    className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all"
                    required
                    {...fieldAria('res-phone-error', !!fieldErrors.holderPhone)}
                  />
                </div>
                <FieldError id="res-phone-error" message={fieldErrors.holderPhone} />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-zinc-800 mb-1.5">
                  Peticiones especiales o notas (opcional)
                </label>
                <div className="relative">
                  <div className="absolute top-3 left-3.5 text-zinc-400 pointer-events-none">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ej. Cumpleaños, requerimos trona para bebé, alergias alimentarias..."
                    className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all resize-none"
                    maxLength={500}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Resumen flotante / Botón de Enviar */}
          <div className="bg-white rounded-3xl p-6 border border-orange-200 shadow-lg shadow-orange-950/5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">
                Resumen de solicitud
              </span>
              <p className="text-base font-bold text-zinc-900 mt-0.5">
                {partySize} {partySize === 1 ? 'persona' : 'personas'} · {selectedDate} ·{' '}
                {selectedTime ? `${selectedTime} hrs` : '(Hora no seleccionada)'} ·{' '}
                {activeZoneConfig?.label || selectedZone}
              </p>
              <p className="text-xs text-zinc-500">
                Al enviar la solicitud, el restaurante revisará y confirmará tu lugar.
              </p>
            </div>

            <button
              type="submit"
              disabled={isPending || !selectedTime}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-2xl bg-orange-600 hover:bg-orange-700 active:scale-[0.98] text-white font-bold text-sm shadow-lg shadow-orange-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Enviando solicitud…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Confirmar Reserva
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
