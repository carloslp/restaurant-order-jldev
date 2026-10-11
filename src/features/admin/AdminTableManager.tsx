// src/features/admin/AdminTableManager.tsx
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getStaffTables,
  upsertTable,
  deleteTable,
  updateTableStatus,
  openTableQrSession,
  closeTableQrSession,
  getStaffLocationSlug,
} from '@/lib/server/tables';
import { useToast } from '@/components/ui/use-toast';
import { QRCodeSVG } from 'qrcode.react';
import { 
  QrCode, 
  Users, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Power, 
  ReceiptText, 
  RefreshCw,
  Sparkles,
  SlidersHorizontal,
  Download,
  Copy,
  Check,
  ExternalLink,
  Link2,
  Globe
} from 'lucide-react';
import type { RestaurantTable, TableStatus, Zone } from '@/lib/types';

interface AdminTableManagerProps {
  localSlug?: string;
}

export function AdminTableManager({ localSlug }: AdminTableManagerProps) {
  const { toast } = useToast();
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedZone, setSelectedZone] = useState<string>('TODAS');
  
  // Modales
  const [showAddModal, setShowAddModal] = useState(false);
  const [qrModalTable, setQrModalTable] = useState<RestaurantTable | null>(null);
  const [walkInModalTable, setWalkInModalTable] = useState<RestaurantTable | null>(null);
  const [walkInGuests, setWalkInGuests] = useState<number>(2);

  // Formulario alta mesa
  const [tableNumber, setTableNumber] = useState('');
  const [tableZone, setTableZone] = useState<Zone>('INTERIOR');
  const [minCap, setMinCap] = useState(1);
  const [maxCap, setMaxCap] = useState(4);
  const [savingTable, setSavingTable] = useState(false);

  // URL de sucursal y mesa para pruebas
  const [activeSlug, setActiveSlug] = useState<string>(localSlug || '');
  const [hostUrl, setHostUrl] = useState<string>('');
  const [copiedTableId, setCopiedTableId] = useState<string | null>(null);
  const [modalCopied, setModalCopied] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHostUrl(window.location.origin);
    }
  }, []);

  useEffect(() => {
    if (localSlug) {
      setActiveSlug(localSlug);
    } else {
      getStaffLocationSlug().then((slug) => {
        if (slug) setActiveSlug(slug);
      });
    }
  }, [localSlug]);

  const getTableUrl = useCallback((table: RestaurantTable) => {
    const origin = hostUrl || (typeof window !== 'undefined' ? window.location.origin : '');
    const slugPart = activeSlug ? `/${activeSlug}` : '';
    const tokenPart = table.qr_token ? `&token=${table.qr_token}` : '';
    return `${origin}${slugPart}?mesa=${encodeURIComponent(table.table_number)}${tokenPart}`;
  }, [hostUrl, activeSlug]);

  const handleCopyUrl = async (url: string, tableId?: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = url;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      if (tableId) {
        setCopiedTableId(tableId);
        setTimeout(() => setCopiedTableId(null), 2000);
      } else {
        setModalCopied(true);
        setTimeout(() => setModalCopied(false), 2000);
      }
      toast({
        title: '¡Enlace copiado!',
        description: 'URL de la mesa copiada al portapapeles.',
      });
    } catch {
      toast({
        title: 'Error al copiar',
        description: 'No se pudo copiar la URL al portapapeles.',
        variant: 'destructive',
      });
    }
  };

  const loadTables = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getStaffTables();
      setTables(data);
    } catch (err) {
      console.error('Error cargando mesas:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTable(true);
    try {
      await upsertTable({
        table_number: tableNumber.trim(),
        zone: tableZone,
        min_capacity: minCap,
        max_capacity: maxCap,
        is_active: true,
      });
      toast({ title: 'Mesa guardada con éxito' });
      setShowAddModal(false);
      setTableNumber('');
      await loadTables();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar mesa';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setSavingTable(false);
    }
  };

  const handleDeleteTable = async (id: string, num: string) => {
    if (!confirm(`¿Eliminar la mesa "${num}"?`)) return;
    try {
      await deleteTable(id);
      toast({ title: 'Mesa eliminada' });
      await loadTables();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al eliminar mesa';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    }
  };

  // Hostess / Sala: Walk-in (Sentar comensales presenciales)
  const handleWalkIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walkInModalTable) return;
    try {
      await updateTableStatus(walkInModalTable.id, 'OCUPADA', walkInGuests);
      toast({ 
        title: `Mesa ${walkInModalTable.table_number} ocupada`, 
        description: `Sentados ${walkInGuests} comensales.` 
      });
      setWalkInModalTable(null);
      await loadTables();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al sentar comensales';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    }
  };

  // Hostess / Sala: Abrir mesa para pedidos QR
  const handleOpenQr = async (table: RestaurantTable) => {
    try {
      await openTableQrSession(table.id, table.current_guests || 2);
      toast({ 
        title: `Comanda QR Abierta en Mesa ${table.table_number}`, 
        description: 'El cliente ya puede escanear y enviar sus pedidos a cocina.' 
      });
      await loadTables();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al abrir QR';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    }
  };

  // Hostess / Sala: Cerrar mesa QR para pedir la cuenta
  const handleCloseQr = async (table: RestaurantTable) => {
    if (!confirm(`¿Cerrar comanda QR de la Mesa ${table.table_number} para preparar la cuenta?`)) return;
    try {
      await closeTableQrSession(table.id);
      toast({ 
        title: `Comanda cerrada en Mesa ${table.table_number}`, 
        description: 'Se bloquearon nuevos pedidos desde el teléfono del cliente. Procede al cobro en caja.' 
      });
      await loadTables();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al cerrar QR';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    }
  };

  // Hostess / Sala: Liberar mesa
  const handleReleaseTable = async (table: RestaurantTable) => {
    try {
      await updateTableStatus(table.id, 'LIBRE');
      toast({ title: `Mesa ${table.table_number} liberada` });
      await loadTables();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al liberar mesa';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    }
  };

  // Filtrado de mesas por zona
  const filteredTables = selectedZone === 'TODAS'
    ? tables
    : tables.filter((t) => t.zone === selectedZone);

  // Resumen dinámico de aforo calculado por zona
  const zoneSummary = useMemo(() => {
    const summary: Record<Zone, { count: number; capacity: number; minCap: number; maxCap: number }> = {
      INTERIOR: { count: 0, capacity: 0, minCap: Infinity, maxCap: 0 },
      TERRAZA: { count: 0, capacity: 0, minCap: Infinity, maxCap: 0 },
      BARRA: { count: 0, capacity: 0, minCap: Infinity, maxCap: 0 },
    };

    tables.forEach((t) => {
      if (!t.is_active) return;
      const z = t.zone as Zone;
      if (summary[z]) {
        summary[z].count += 1;
        summary[z].capacity += t.max_capacity;
        summary[z].minCap = Math.min(summary[z].minCap, t.min_capacity);
        summary[z].maxCap = Math.max(summary[z].maxCap, t.max_capacity);
      }
    });

    return summary;
  }, [tables]);

  const totalCalculatedCapacity = useMemo(() => {
    return tables.filter((t) => t.is_active).reduce((sum, t) => sum + (t.max_capacity || 0), 0);
  }, [tables]);

  // Estadísticas rápidas de sala
  const freeCount = tables.filter((t) => t.status === 'LIBRE').length;
  const occupiedCount = tables.filter((t) => t.status === 'OCUPADA').length;
  const reservedCount = tables.filter((t) => t.status === 'RESERVADA').length;
  const qrActiveCount = tables.filter((t) => t.qr_status === 'ABIERTO').length;

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-zinc-500">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-zinc-400" />
        Cargando estado de las mesas en tiempo real…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Banner de Aforo Derivado del Salón */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 text-white rounded-3xl p-6 shadow-md border border-zinc-700 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-700/60 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
              <h2 className="text-base font-extrabold tracking-tight">Capacidad Total del Salón (Fuente Única)</h2>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              El aforo para reservas y ocupación se calcula automáticamente sumando las mesas físicas activas.
            </p>
          </div>
          <div className="text-right sm:text-right">
            <span className="text-2xl font-black text-white">{totalCalculatedCapacity}</span>
            <span className="text-xs text-zinc-400 ml-1">lugares totales</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(['INTERIOR', 'TERRAZA', 'BARRA'] as Zone[]).map((zone) => {
            const data = zoneSummary[zone];
            const hasTables = data.count > 0;
            return (
              <div key={zone} className="bg-white/5 border border-white/10 rounded-2xl p-3.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-300">
                    {zone === 'INTERIOR' ? 'Interior' : zone === 'TERRAZA' ? 'Terraza' : 'Barra'}
                  </span>
                  <span className="text-xs font-extrabold text-orange-400">
                    {data.capacity} plazas
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                  <span>{data.count} {data.count === 1 ? 'mesa activa' : 'mesas activas'}</span>
                  <span>{hasTables ? `${data.minCap} a ${data.maxCap} pers/mesa` : 'Sin mesas'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Barra de Estadísticas y Acciones de Sala */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-4">
          <span className="text-xs font-semibold text-emerald-800">Mesas Libres</span>
          <p className="text-2xl font-black text-emerald-950 mt-1">{freeCount}</p>
        </div>
        <div className="bg-red-50 border border-red-200/80 rounded-2xl p-4">
          <span className="text-xs font-semibold text-red-800">Mesas Ocupadas</span>
          <p className="text-2xl font-black text-red-950 mt-1">{occupiedCount}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4">
          <span className="text-xs font-semibold text-amber-800">Mesas Reservadas</span>
          <p className="text-2xl font-black text-amber-950 mt-1">{reservedCount}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200/80 rounded-2xl p-4">
          <span className="text-xs font-semibold text-blue-800">Comandas QR Activas</span>
          <p className="text-2xl font-black text-blue-950 mt-1">{qrActiveCount}</p>
        </div>
      </div>

      {/* Selector de Zonas y Botón Alta */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-sm">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          {['TODAS', 'INTERIOR', 'TERRAZA', 'BARRA'].map((zone) => (
            <button
              key={zone}
              onClick={() => setSelectedZone(zone)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                selectedZone === zone
                  ? 'bg-zinc-900 text-white shadow-sm'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {zone === 'TODAS' ? 'Todas las Zonas' : zone}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {activeSlug && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50 border border-orange-200/80 text-xs font-bold text-orange-800">
              <Globe className="w-3.5 h-3.5 text-orange-600" />
              <span>Sucursal: <code className="font-mono text-orange-950">/{activeSlug}</code></span>
            </span>
          )}
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition shadow-sm cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            Dar de Alta Mesa
          </button>
        </div>
      </div>

      {/* Tablero de Mesas */}
      {filteredTables.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-zinc-200/80 space-y-3">
          <SlidersHorizontal className="w-10 h-10 mx-auto text-zinc-300" />
          <p className="text-sm font-semibold text-zinc-700">No hay mesas dadas de alta en esta zona.</p>
          <p className="text-xs text-zinc-400">
            Haz clic en el botón de arriba para registrar las mesas físicas de tu restaurante.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredTables.map((table) => {
            const isFree = table.status === 'LIBRE';
            const isOccupied = table.status === 'OCUPADA';
            const isReserved = table.status === 'RESERVADA';
            const isQrOpen = table.qr_status === 'ABIERTO';
            const tableUrl = getTableUrl(table);

            return (
              <div
                key={table.id}
                className={`rounded-2xl border p-5 bg-white shadow-sm flex flex-col justify-between gap-4 transition hover:shadow-md ${
                  isOccupied
                    ? 'border-red-200 bg-red-50/20'
                    : isReserved
                    ? 'border-amber-200 bg-amber-50/20'
                    : 'border-zinc-200/80'
                }`}
              >
                {/* Cabecera Mesa */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-black text-zinc-900">{table.table_number}</span>
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                        {table.zone}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-zinc-500 mt-1">
                      <Users className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{table.min_capacity} – {table.max_capacity} pers.</span>
                      {isOccupied && table.current_guests ? (
                        <span className="font-bold text-red-600">({table.current_guests} sentados)</span>
                      ) : null}
                    </div>
                  </div>

                  {/* Estado Visual */}
                  <span
                    className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                      isFree
                        ? 'bg-emerald-100 text-emerald-800'
                        : isOccupied
                        ? 'bg-red-100 text-red-800'
                        : isReserved
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-zinc-100 text-zinc-700'
                    }`}
                  >
                    {table.status}
                  </span>
                </div>

                {/* Badge de Sesión QR */}
                <div className="flex items-center justify-between text-xs py-2 px-3 rounded-xl bg-zinc-50 border border-zinc-200/60">
                  <span className="text-zinc-500 font-medium flex items-center gap-1.5">
                    <QrCode className="w-3.5 h-3.5" />
                    Comanda QR:
                  </span>
                  {isQrOpen ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600">
                      <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                      ABIERTO
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-zinc-400">Inactivo</span>
                  )}
                </div>

                {/* Enlace y URL directa de la mesa para pruebas */}
                <div className="bg-zinc-50/90 border border-zinc-200/80 rounded-xl p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-500">
                    <span className="flex items-center gap-1 text-zinc-700">
                      <Link2 className="w-3.5 h-3.5 text-orange-600" />
                      URL para pruebas:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleCopyUrl(tableUrl, table.id)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-600 hover:text-orange-600 transition cursor-pointer"
                        title="Copiar URL directa al portapapeles"
                      >
                        {copiedTableId === table.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-600">¡Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copiar</span>
                          </>
                        )}
                      </button>
                      <span className="text-zinc-300">|</span>
                      <a
                        href={tableUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-600 hover:text-orange-700 hover:underline transition"
                        title="Abrir enlace de la mesa en nueva pestaña"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Probar</span>
                      </a>
                    </div>
                  </div>
                  <div 
                    className="bg-white px-2 py-1 rounded-lg border border-zinc-200/70 text-[10px] font-mono text-zinc-600 truncate select-all" 
                    title={tableUrl}
                  >
                    {tableUrl || 'Generando enlace…'}
                  </div>
                </div>

                {/* Botones de Control de Sala */}
                <div className="space-y-2 pt-2 border-t border-zinc-100">
                  {isFree ? (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          setWalkInModalTable(table);
                          setWalkInGuests(table.min_capacity);
                        }}
                        className="w-full py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold transition cursor-pointer"
                      >
                        Sentar
                      </button>
                      <button
                        onClick={() => handleOpenQr(table)}
                        className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Power className="w-3.5 h-3.5" />
                        Abrir QR
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {isQrOpen ? (
                        <button
                          onClick={() => handleCloseQr(table)}
                          className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1"
                        >
                          <ReceiptText className="w-3.5 h-3.5" />
                          Pedir Cuenta
                        </button>
                      ) : (
                        <button
                          onClick={() => handleOpenQr(table)}
                          className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition cursor-pointer"
                        >
                          Activar QR
                        </button>
                      )}
                      <button
                        onClick={() => handleReleaseTable(table)}
                        className="w-full py-2 rounded-xl bg-zinc-200 hover:bg-zinc-300 text-zinc-800 text-xs font-bold transition cursor-pointer"
                      >
                        Liberar
                      </button>
                    </div>
                  )}

                  {/* Acciones Secundarias (Ver QR y Borrar) */}
                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={() => setQrModalTable(table)}
                      className="text-xs font-semibold text-zinc-500 hover:text-orange-600 inline-flex items-center gap-1 transition"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      Ver Código QR
                    </button>
                    <button
                      onClick={() => handleDeleteTable(table.id, table.table_number)}
                      className="text-zinc-400 hover:text-red-600 p-1 transition"
                      title="Eliminar mesa"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Sentar Comensales (Walk-in) */}
      {walkInModalTable && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-xl space-y-4 border border-zinc-200">
            <h4 className="font-bold text-base text-zinc-900">
              Sentar comensales en {walkInModalTable.table_number}
            </h4>
            <form onSubmit={handleWalkIn} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Número de comensales
                </label>
                <input
                  type="number"
                  min="1"
                  max={walkInModalTable.max_capacity + 2}
                  value={walkInGuests}
                  onChange={(e) => setWalkInGuests(Number(e.target.value))}
                  className="w-full rounded-xl border border-zinc-300 p-2.5 text-base font-bold focus:ring-2 focus:ring-orange-500"
                />
                <p className="text-[11px] text-zinc-400 mt-1">
                  Capacidad sugerida de esta mesa: {walkInModalTable.min_capacity} a {walkInModalTable.max_capacity} pers.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setWalkInModalTable(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-600 hover:bg-zinc-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold transition"
                >
                  Confirmar y Ocupar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Ver e Imprimir Código QR */}
      {qrModalTable && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-xl space-y-4 border border-zinc-200 text-center">
            <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
              <span className="font-bold text-base text-zinc-900 flex items-center gap-2">
                <QrCode className="w-5 h-5 text-orange-600" />
                Mesa: {qrModalTable.table_number} ({qrModalTable.zone})
              </span>
              <button
                onClick={() => setQrModalTable(null)}
                className="text-zinc-400 hover:text-zinc-600 text-base font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 bg-white border border-zinc-200 rounded-2xl flex flex-col items-center justify-center shadow-inner">
              <QRCodeSVG
                value={getTableUrl(qrModalTable)}
                size={190}
                level="H"
                includeMargin
              />
              <p className="mt-3 text-xs font-extrabold text-zinc-900">
                Escanea para pedir en {qrModalTable.table_number}
              </p>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Los comensales podrán consultar la carta y pedir directo a cocina.
              </p>
            </div>

            {/* Enlace Directo / URL de la mesa para pruebas */}
            <div className="space-y-2 text-left bg-zinc-50 p-3.5 rounded-2xl border border-zinc-200/90">
              <label className="text-xs font-bold text-zinc-700 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-orange-600" />
                  URL directa de la mesa:
                </span>
                <span className="text-[10px] font-medium text-zinc-500">
                  Prueba en tu navegador
                </span>
              </label>
              
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  readOnly
                  value={getTableUrl(qrModalTable)}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="w-full bg-white border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs font-mono text-zinc-700 truncate select-all focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                <button
                  type="button"
                  onClick={() => handleCopyUrl(getTableUrl(qrModalTable))}
                  className="px-3 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer border border-orange-200"
                >
                  {modalCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between pt-1">
                <a
                  href={getTableUrl(qrModalTable)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:text-orange-700 hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Abrir enlace en nueva pestaña
                </a>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                  qrModalTable.qr_status === 'ABIERTO' 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'bg-zinc-200 text-zinc-600'
                }`}>
                  {qrModalTable.qr_status === 'ABIERTO' ? '● Comanda abierta' : '○ Comanda inactiva'}
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <a
                href={getTableUrl(qrModalTable)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm shadow-orange-600/20"
              >
                <ExternalLink className="w-4 h-4" />
                Probar Mesa
              </a>
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                Imprimir QR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Dar de Alta Mesa */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-xl space-y-4 border border-zinc-200">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h4 className="font-bold text-base text-zinc-900">Dar de Alta Mesa Física</h4>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-zinc-400 hover:text-zinc-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTable} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Número o Identificador de Mesa
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Mesa 1, Terraza 4, Barra 2"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 p-2 text-sm font-medium focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Zona del restaurante</label>
                <select
                  value={tableZone}
                  onChange={(e) => setTableZone(e.target.value as Zone)}
                  className="w-full rounded-xl border border-zinc-300 p-2 text-sm font-medium focus:ring-2 focus:ring-orange-500"
                >
                  <option value="INTERIOR">Interior (Salón principal)</option>
                  <option value="TERRAZA">Terraza (Área exterior)</option>
                  <option value="BARRA">Barra</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Capacidad Mínima</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={minCap}
                    onChange={(e) => setMinCap(Number(e.target.value))}
                    className="w-full rounded-xl border border-zinc-300 p-2 text-sm font-medium focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Capacidad Máxima</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={maxCap}
                    onChange={(e) => setMaxCap(Number(e.target.value))}
                    className="w-full rounded-xl border border-zinc-300 p-2 text-sm font-medium focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-600 hover:bg-zinc-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingTable}
                  className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition disabled:opacity-50"
                >
                  {savingTable ? 'Guardando…' : 'Guardar Mesa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
