// src/features/admin/AdminShiftsEditor.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { getStaffLocalShifts, upsertShift, deleteShift } from '@/lib/server/schedules';
import { useToast } from '@/components/ui/use-toast';
import { Clock, Plus, Trash2, CheckCircle2, AlertCircle, Calendar } from 'lucide-react';
import type { LocalShift } from '@/lib/types';

const DAYS_OF_WEEK = [
  { day: 1, name: 'Lunes' },
  { day: 2, name: 'Martes' },
  { day: 3, name: 'Miércoles' },
  { day: 4, name: 'Jueves' },
  { day: 5, name: 'Viernes' },
  { day: 6, name: 'Sábado' },
  { day: 0, name: 'Domingo' },
];

export function AdminShiftsEditor() {
  const { toast } = useToast();
  const [shifts, setShifts] = useState<LocalShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Formulario nuevo turno
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [shiftName, setShiftName] = useState('Comida');
  const [openTime, setOpenTime] = useState('13:00');
  const [closeTime, setCloseTime] = useState('17:00');
  const [slotInterval, setSlotInterval] = useState(30);
  const [turnDuration, setTurnDuration] = useState(90);
  const [bufferMinutes, setBufferMinutes] = useState(15);

  const loadShifts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getStaffLocalShifts();
      setShifts(data);
    } catch (err) {
      console.error('Error al cargar turnos:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadShifts();
  }, [loadShifts]);

  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await upsertShift({
        day_of_week: selectedDay,
        shift_name: shiftName,
        open_time: openTime,
        close_time: closeTime,
        slot_interval_minutes: slotInterval,
        turn_duration_minutes: turnDuration,
        buffer_minutes: bufferMinutes,
        is_active: true,
      });
      toast({ title: 'Turno guardado', description: `Turno ${shiftName} añadido con éxito.` });
      setShowModal(false);
      await loadShifts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar turno';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteShift = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar el turno "${name}"?`)) return;
    try {
      await deleteShift(id);
      toast({ title: 'Turno eliminado' });
      await loadShifts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al eliminar';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-zinc-500">
        <Clock className="w-6 h-6 animate-spin mx-auto mb-2 text-zinc-400" />
        Cargando configuración de horarios y turnos…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-sm">
        <div>
          <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-orange-600" />
            Horarios y Múltiples Turnos de Servicio
          </h3>
          <p className="text-xs text-zinc-500 mt-1">
            Configura turnos partidos (ej. Comida y Cena) con duración de estancia y franjas horarias personalizadas por día.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Añadir Turno
        </button>
      </div>

      {/* Grid de días */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {DAYS_OF_WEEK.map(({ day, name }) => {
          const dayShifts = shifts.filter((s) => s.day_of_week === day);

          return (
            <div
              key={day}
              className="bg-white rounded-2xl border border-zinc-200/80 p-5 shadow-sm space-y-4 hover:border-zinc-300 transition"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <span className="font-extrabold text-sm text-zinc-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-zinc-400" />
                  {name}
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                  {dayShifts.length === 0 ? 'Sin turnos (Cerrado)' : `${dayShifts.length} turno(s)`}
                </span>
              </div>

              {dayShifts.length === 0 ? (
                <div className="py-6 text-center text-xs text-zinc-400">
                  No hay horarios programados.
                  <button
                    onClick={() => {
                      setSelectedDay(day);
                      setShowModal(true);
                    }}
                    className="block mx-auto mt-2 text-orange-600 hover:underline font-semibold"
                  >
                    + Configurar horario
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {dayShifts.map((shift) => (
                    <div
                      key={shift.id}
                      className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200/70 text-xs space-y-2 relative group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-zinc-900">{shift.shift_name}</span>
                        <button
                          onClick={() => handleDeleteShift(shift.id, shift.shift_name)}
                          className="text-zinc-400 hover:text-red-600 transition p-1"
                          title="Eliminar turno"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="font-mono font-semibold text-zinc-700">
                        {shift.open_time.slice(0, 5)} – {shift.close_time.slice(0, 5)} hrs
                      </div>

                      <div className="grid grid-cols-3 gap-1 pt-1 text-[10px] text-zinc-500 border-t border-zinc-200/60">
                        <div>
                          <span className="block text-zinc-400">Franja</span>
                          <strong>cada {shift.slot_interval_minutes}m</strong>
                        </div>
                        <div>
                          <span className="block text-zinc-400">Estancia</span>
                          <strong>{shift.turn_duration_minutes}m</strong>
                        </div>
                        <div>
                          <span className="block text-zinc-400">Limpieza</span>
                          <strong>{shift.buffer_minutes}m</strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal Añadir Turno */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-xl space-y-5 border border-zinc-200">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h4 className="font-bold text-base text-zinc-900">Añadir Turno de Servicio</h4>
              <button
                onClick={() => setShowModal(false)}
                className="text-zinc-400 hover:text-zinc-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateShift} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Día de la semana</label>
                <select
                  value={selectedDay}
                  onChange={(e) => setSelectedDay(Number(e.target.value))}
                  className="w-full rounded-xl border border-zinc-300 p-2 text-sm font-medium focus:ring-2 focus:ring-orange-500"
                >
                  {DAYS_OF_WEEK.map(({ day, name }) => (
                    <option key={day} value={day}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Nombre del turno</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Comida, Cena, Desayuno"
                  value={shiftName}
                  onChange={(e) => setShiftName(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 p-2 text-sm font-medium focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Hora Inicio</label>
                  <input
                    type="time"
                    required
                    value={openTime}
                    onChange={(e) => setOpenTime(e.target.value)}
                    className="w-full rounded-xl border border-zinc-300 p-2 text-sm font-medium focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Hora Fin</label>
                  <input
                    type="time"
                    required
                    value={closeTime}
                    onChange={(e) => setCloseTime(e.target.value)}
                    className="w-full rounded-xl border border-zinc-300 p-2 text-sm font-medium focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-700 mb-1">Intervalo franjas</label>
                  <select
                    value={slotInterval}
                    onChange={(e) => setSlotInterval(Number(e.target.value))}
                    className="w-full rounded-xl border border-zinc-300 p-1.5 text-xs"
                  >
                    <option value={15}>15 min</option>
                    <option value={30}>30 min</option>
                    <option value={45}>45 min</option>
                    <option value={60}>60 min</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-700 mb-1">Duración reserva</label>
                  <select
                    value={turnDuration}
                    onChange={(e) => setTurnDuration(Number(e.target.value))}
                    className="w-full rounded-xl border border-zinc-300 p-1.5 text-xs"
                  >
                    <option value={60}>60 min</option>
                    <option value={75}>75 min</option>
                    <option value={90}>90 min</option>
                    <option value={120}>120 min</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-700 mb-1">Buffer limpieza</label>
                  <select
                    value={bufferMinutes}
                    onChange={(e) => setBufferMinutes(Number(e.target.value))}
                    className="w-full rounded-xl border border-zinc-300 p-1.5 text-xs"
                  >
                    <option value={0}>0 min</option>
                    <option value={10}>10 min</option>
                    <option value={15}>15 min</option>
                    <option value={20}>20 min</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-600 hover:bg-zinc-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Guardando…' : 'Guardar Turno'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
