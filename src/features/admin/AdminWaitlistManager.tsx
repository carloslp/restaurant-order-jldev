'use client';

import { useState } from 'react';
import { 
  Users, 
  Clock, 
  Phone, 
  MessageSquare, 
  CheckCircle2, 
  XCircle, 
  Sparkles, 
  QrCode, 
  Plus, 
  ExternalLink, 
  AlertCircle,
  Building2,
  Trees,
  Coffee,
  Check,
  ChevronRight
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { WaitlistParty, RestaurantTable, WaitlistZonePreference } from '@/lib/types';
import { 
  callWaitlistParty, 
  seatWaitlistParty, 
  updateWaitlistStatus, 
  addManualWaitlist 
} from '@/lib/server/waitlist';
import { useToast } from '@/components/ui/use-toast';

interface Props {
  waitlist: WaitlistParty[];
  tables: RestaurantTable[];
  localSlug?: string;
  onRefresh: () => Promise<void>;
}

export function AdminWaitlistManager({ waitlist, tables, localSlug, onRefresh }: Props) {
  const { toast } = useToast();

  const [seatingParty, setSeatingParty] = useState<WaitlistParty | null>(null);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [isSeating, setIsSeating] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  // Formulario manual
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualSize, setManualSize] = useState<number>(2);
  const [manualZone, setManualZone] = useState<WaitlistZonePreference>('CUALQUIERA');
  const [manualNotes, setManualNotes] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // URL pública de la fila para clientes en puerta
  const waitlistPublicUrl = typeof window !== 'undefined' && localSlug
    ? `${window.location.origin}/${localSlug}/fila`
    : `/${localSlug || 'local'}/fila`;

  // Mesas disponibles actualmente en sala
  const freeTables = tables.filter((t) => t.status === 'LIBRE');

  // Acciones
  const handleCall = async (party: WaitlistParty) => {
    try {
      await callWaitlistParty(party.id);
      toast({ 
        title: `Comensal llamado: ${party.customer_name}`, 
        description: 'Se actualizó a estado LLAMADO.' 
      });

      // Si tiene teléfono válido de 10 dígitos, ofrecer aviso por WhatsApp
      const cleanPhone = party.customer_phone.replace(/\D/g, '');
      if (cleanPhone.length >= 10) {
        const text = encodeURIComponent(
          `¡Hola ${party.customer_name}! Tu mesa para ${party.party_size} personas ya está lista. Por favor preséntate en la entrada con el Hostess para pasar. ¡Te esperamos!`
        );
        const waUrl = cleanPhone.length === 10 ? `https://wa.me/52${cleanPhone}?text=${text}` : `https://wa.me/${cleanPhone}?text=${text}`;
        window.open(waUrl, '_blank');
      }

      await onRefresh();
    } catch (err: any) {
      toast({ title: 'Error al llamar', description: err.message, variant: 'destructive' });
    }
  };

  const handleSeatConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seatingParty || selectedTableIds.length === 0) return;

    setIsSeating(true);
    try {
      await seatWaitlistParty(seatingParty.id, selectedTableIds);
      const isMulti = selectedTableIds.length > 1;
      toast({ 
        title: isMulti ? `Mesas combinadas asignadas a ${seatingParty.customer_name}` : `Mesa asignada a ${seatingParty.customer_name}`, 
        description: isMulti 
          ? `Se ocuparon ${selectedTableIds.length} mesas contiguas para albergar al grupo de ${seatingParty.party_size} personas.` 
          : 'La mesa se marcó como ocupada y el comensal pasó a la sala.' 
      });
      setSeatingParty(null);
      setSelectedTableIds([]);
      await onRefresh();
    } catch (err: any) {
      toast({ title: 'Error al sentar', description: err.message, variant: 'destructive' });
    } finally {
      setIsSeating(false);
    }
  };

  const handleCancelStatus = async (party: WaitlistParty, newStatus: 'CANCELADO' | 'NO_SHOW') => {
    if (!confirm(`¿Marcar turno de ${party.customer_name} como ${newStatus.toLowerCase()}?`)) return;
    try {
      await updateWaitlistStatus(party.id, newStatus);
      toast({ title: `Turno ${newStatus.toLowerCase()}` });
      await onRefresh();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim() || !manualPhone.trim()) return;

    setIsAdding(true);
    try {
      await addManualWaitlist({
        customer_name: manualName,
        customer_phone: manualPhone,
        party_size: manualSize,
        preferred_zone: manualZone,
        notes: manualNotes,
      });
      toast({ title: 'Comensal agregado a la fila' });
      setShowAddModal(false);
      setManualName('');
      setManualPhone('');
      setManualSize(2);
      setManualZone('CUALQUIERA');
      setManualNotes('');
      await onRefresh();
    } catch (err: any) {
      toast({ title: 'Error al agregar', description: err.message, variant: 'destructive' });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Barra de Controles Superior */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 motion-safe:animate-pulse" />
            <h2 className="text-base font-extrabold text-zinc-900">
              Fila de Espera en Vivo ({waitlist.length} grupos aguardando)
            </h2>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Comensales presenciales en puerta esperando mesa durante horas pico o sobrecupo.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold transition-all cursor-pointer select-none"
          >
            <QrCode className="w-4 h-4 text-zinc-600" />
            <span>Ver QR para Puerta</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-sm shadow-orange-600/30 transition-all cursor-pointer select-none active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>+ Agregar Manualmente</span>
          </button>
        </div>
      </div>

      {/* Lista de Espera */}
      {waitlist.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-zinc-300 p-8 space-y-3">
          <div className="w-14 h-14 bg-orange-50 text-orange-500 rounded-2xl flex items-center justify-center mx-auto">
            <Users className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-zinc-900">No hay comensales en la fila de espera</h3>
          <p className="text-xs text-zinc-500 max-w-md mx-auto">
            La fila de espera está vacía. Cuando haya sobrecupo, los clientes pueden escanear el QR en la puerta o puedes agregarlos aquí con el botón naranja.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {waitlist.map((item, index) => {
            const isCalled = item.status === 'LLAMADO';
            const cleanPhone = item.customer_phone.replace(/\D/g, '');
            const waUrl = cleanPhone.length === 10 ? `https://wa.me/52${cleanPhone}` : `https://wa.me/${cleanPhone}`;

            return (
              <div
                key={item.id}
                className={`rounded-2xl border p-5 shadow-xs transition-all flex flex-col justify-between ${
                  isCalled
                    ? 'bg-emerald-50/70 border-emerald-400 ring-2 ring-emerald-300'
                    : 'bg-white border-zinc-200/90 hover:border-orange-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-zinc-900 text-white">
                      <span>Turno #{index + 1}</span>
                    </span>

                    {isCalled ? (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-500 text-white motion-safe:animate-pulse">
                        Llamado
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold text-orange-700 bg-orange-100">
                        En espera
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-black text-zinc-900">{item.customer_name}</h3>
                  
                  <div className="flex items-center gap-3 text-xs text-zinc-600 font-semibold mt-1">
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-orange-500" />
                      <span>{item.party_size} comensales</span>
                    </span>
                    <span>•</span>
                    <span>Zona: {item.preferred_zone}</span>
                  </div>

                  {item.notes && (
                    <p className="mt-2 text-xs text-zinc-500 bg-zinc-50 rounded-lg p-2 border border-zinc-100">
                      "{item.notes}"
                    </p>
                  )}

                  <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-500">
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-semibold"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>{item.customer_phone}</span>
                    </a>
                    <span className="text-[11px]">
                      {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                {/* Acciones del Turno */}
                <div className="mt-4 pt-3 border-t border-zinc-100 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleCall(item)}
                      className="px-3 py-2 min-h-[38px] rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold transition-all select-none cursor-pointer flex items-center justify-center gap-1"
                    >
                      <span>Llamar / Avisar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSeatingParty(item);
                        const match = freeTables.find((t) => t.max_capacity >= item.party_size);
                        if (match) setSelectedTableIds([match.id]);
                        else if (freeTables.length > 0) setSelectedTableIds([freeTables[0].id]);
                        else setSelectedTableIds([]);
                      }}
                      className="px-3 py-2 min-h-[38px] rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition-all select-none cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                    >
                      <span>Sentar en Mesa</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1">
                    <button
                      type="button"
                      onClick={() => handleCancelStatus(item, 'NO_SHOW')}
                      className="hover:text-amber-600 font-medium underline"
                    >
                      No se presentó
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCancelStatus(item, 'CANCELADO')}
                      className="hover:text-red-600 font-medium underline"
                    >
                      Cancelar turno
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: SENTAR EN MESA FÍSICA (MULTI-MESA COMPATIBLE) */}
      {seatingParty && (() => {
        const selectedTables = freeTables.filter((t) => selectedTableIds.includes(t.id));
        const totalSelectedCapacity = selectedTables.reduce((acc, t) => acc + t.max_capacity, 0);
        const isCapacitySufficient = totalSelectedCapacity >= seatingParty.party_size;

        const toggleTable = (id: string) => {
          setSelectedTableIds((prev) =>
            prev.includes(id) ? prev.filter((tId) => tId !== id) : [...prev, id]
          );
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 space-y-5 border border-zinc-200">
              <div>
                <span className="text-xs font-black uppercase text-orange-600 tracking-wider">Asignación de Mesa</span>
                <h3 className="text-xl font-black text-zinc-900 mt-0.5">
                  Sentar a {seatingParty.customer_name}
                </h3>
                <p className="text-xs text-zinc-500">
                  Grupo de <strong className="text-zinc-800">{seatingParty.party_size} personas</strong> (Preferencia: {seatingParty.preferred_zone}).
                </p>
              </div>

              {/* Indicador acumulador de aforo al combinar mesas */}
              <div className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between transition-all ${
                selectedTableIds.length === 0
                  ? 'bg-zinc-50 border-zinc-200 text-zinc-600'
                  : isCapacitySufficient
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-amber-50 border-amber-300 text-amber-900'
              }`}>
                <div>
                  <p className="font-extrabold text-sm">
                    {selectedTableIds.length === 0
                      ? 'Sin mesa seleccionada'
                      : selectedTableIds.length === 1
                      ? `Mesa ${selectedTables[0]?.table_number}`
                      : `${selectedTableIds.length} mesas unidas: ${selectedTables.map((t) => t.table_number).join(' + ')}`}
                  </p>
                  <p className="text-[11px] mt-0.5 opacity-90">
                    Capacidad total:{' '}
                    <strong>{totalSelectedCapacity} lugares</strong> para grupo de{' '}
                    <strong>{seatingParty.party_size} personas</strong>.
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {selectedTableIds.length === 0 ? (
                    <span className="text-[11px] font-bold text-zinc-500">Elige mesa(s)</span>
                  ) : isCapacitySufficient ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-600 text-white">
                      ✓ Suficiente
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-500 text-white animate-pulse">
                      ⚠️ Faltan {seatingParty.party_size - totalSelectedCapacity} pax
                    </span>
                  )}
                </div>
              </div>

              <form onSubmit={handleSeatConfirm} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold uppercase text-zinc-500">
                      Selecciona una o varias mesas para unir:
                    </label>
                    <span className="text-[11px] text-zinc-400">
                      (Toca para seleccionar o unir)
                    </span>
                  </div>

                  {freeTables.length === 0 ? (
                    <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
                      <p className="font-bold">⚠️ No hay mesas en estado LIBRE actualmente.</p>
                      <p>Espera a que un comensal pague en caja o libera una mesa desde la pestaña Sala y Mesas.</p>
                    </div>
                  ) : (() => {
                    const isOptimalTable = (t: RestaurantTable) => {
                      const matchesZone =
                        seatingParty.preferred_zone === 'CUALQUIERA' ||
                        t.zone === seatingParty.preferred_zone;
                      const matchesCap =
                        t.max_capacity >= seatingParty.party_size &&
                        seatingParty.party_size >= (t.min_capacity || 1);
                      return matchesZone && matchesCap;
                    };

                    const sortedFreeTables = [...freeTables].sort((a, b) => {
                      const aOpt = isOptimalTable(a) ? 1 : 0;
                      const bOpt = isOptimalTable(b) ? 1 : 0;
                      if (aOpt !== bOpt) return bOpt - aOpt;
                      return (
                        a.max_capacity - b.max_capacity ||
                        a.table_number.localeCompare(b.table_number)
                      );
                    });

                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto p-1">
                        {sortedFreeTables.map((t) => {
                          const isSelected = selectedTableIds.includes(t.id);
                          const isOpt = isOptimalTable(t);

                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => toggleTable(t.id)}
                              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer relative ${
                                isSelected
                                  ? 'bg-orange-50 border-orange-500 ring-2 ring-orange-400 shadow-sm'
                                  : isOpt
                                  ? 'bg-emerald-50/30 border-emerald-300 hover:border-emerald-400'
                                  : 'bg-zinc-50 border-zinc-200 hover:border-zinc-300'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-sm font-black text-zinc-900">
                                    Mesa {t.table_number}
                                  </span>
                                  {isOpt && (
                                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded-md">
                                      ✨ Sugerida
                                    </span>
                                  )}
                                </div>
                                {isSelected && (
                                  <span className="w-4 h-4 rounded-full bg-orange-600 text-white text-[10px] flex items-center justify-center font-bold shrink-0">
                                    ✓
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-zinc-500 mt-1">
                                Zona: <strong className="text-zinc-700">{t.zone}</strong>
                              </div>
                              <div className="text-[11px] font-bold text-zinc-700 mt-0.5">
                                {t.min_capacity}-{t.max_capacity} pax
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSeatingParty(null);
                      setSelectedTableIds([]);
                    }}
                    className="flex-1 py-3 rounded-xl border border-zinc-200 text-zinc-600 font-bold text-xs hover:bg-zinc-50 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={selectedTableIds.length === 0 || isSeating}
                    className="flex-1 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-black text-xs shadow-md shadow-orange-600/30 transition-all cursor-pointer"
                  >
                    {isSeating
                      ? 'Asignando…'
                      : selectedTableIds.length > 1
                      ? `Confirmar y Unir (${selectedTableIds.length} Mesas)`
                      : 'Confirmar y Sentar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* MODAL 2: QR PARA PUERTA */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 text-center space-y-5 border border-zinc-200">
            <div>
              <h3 className="text-lg font-black text-zinc-900">Código QR para la Puerta</h3>
              <p className="text-xs text-zinc-500 mt-1">
                Coloca este código en el mostrador o entrada para que los comensales se anoten desde su móvil.
              </p>
            </div>

            <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200 inline-block mx-auto">
              <QRCodeSVG value={waitlistPublicUrl} size={180} />
            </div>

            <div className="text-xs text-zinc-500 font-mono bg-zinc-100 p-2 rounded-xl break-all">
              {waitlistPublicUrl}
            </div>

            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="w-full py-2.5 rounded-xl bg-zinc-900 text-white font-bold text-xs"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* MODAL 3: AGREGAR MANUALMENTE */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-zinc-200">
            <div>
              <h3 className="text-lg font-black text-zinc-900">Agregar a Fila Manualmente</h3>
              <p className="text-xs text-zinc-500">
                Para comensales que no cuentan con teléfono o prefieren registro directo con Hostess.
              </p>
            </div>

            <form onSubmit={handleManualAdd} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-zinc-600 mb-1">Nombre *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. María López"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-600 mb-1">Teléfono / Celular *</label>
                <input
                  type="tel"
                  required
                  placeholder="Ej. 667 987 6543"
                  value={manualPhone}
                  onChange={(e) => setManualPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-600 mb-1">Comensales</label>
                  <input
                    type="number"
                    min={1}
                    max={25}
                    value={manualSize}
                    onChange={(e) => setManualSize(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-600 mb-1">Zona</label>
                  <select
                    value={manualZone}
                    onChange={(e) => setManualZone(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="CUALQUIERA">Cualquiera</option>
                    <option value="INTERIOR">Interior</option>
                    <option value="TERRAZA">Terraza</option>
                    <option value="BARRA">Barra</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-600 mb-1">Notas (opcional)</label>
                <input
                  type="text"
                  placeholder="Ej. Lleva carriola"
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-200 text-zinc-600 font-bold text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isAdding}
                  className="flex-1 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-black text-xs shadow-md shadow-orange-600/30"
                >
                  {isAdding ? 'Guardando…' : 'Agregar a la Fila'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
