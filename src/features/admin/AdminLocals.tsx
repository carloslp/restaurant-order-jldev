'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  listLocals,
  createLocal,
  updateLocal,
  deleteLocal,
  getLocalById,
  geocodeAddressAction,
  toggleLocalOpenStatus,
  toggleLocalCatalogMode,
  toggleLocalReservationsEnabled,
} from '@/lib/server/locals';
import { useToast } from '@/components/ui/use-toast';
import { FormAlert, FieldError, fieldAria } from '@/components/ui/form-error';
import { useServerForm } from '@/lib/forms';
import { ZoneCapacityEditor } from '@/features/admin/ZoneCapacityEditor';
import { validateLocationSlug } from '@/lib/slugs';
import { MapPin, Search, Loader2, Power, Eye, ShoppingCart, Calendar } from 'lucide-react';

interface Local {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  iva_rate: number;
  delivery_fee: number;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_open?: boolean;
  is_catalog_only?: boolean;
  reservations_enabled?: boolean;
  created_at: string;
  updated_at: string;
}

interface LocalFormData {
  name: string;
  slug: string;
  timezone: string;
  iva_rate: number;
  delivery_fee: number;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_open: boolean;
  is_catalog_only: boolean;
  reservations_enabled: boolean;
}

const initialFormData: LocalFormData = {
  name: '',
  slug: '',
  timezone: 'America/Mexico_City',
  iva_rate: 0.16,
  delivery_fee: 0,
  address: '',
  latitude: null,
  longitude: null,
  is_open: true,
  is_catalog_only: false,
  reservations_enabled: true,
};

export function AdminLocals() {
  const { toast } = useToast();
  const [localsList, setLocalsList] = useState<Local[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingLocal, setEditingLocal] = useState<Local | null>(null);
  const [formData, setFormData] = useState<LocalFormData>(initialFormData);
  const [showForm, setShowForm] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const { saving, formError, fieldErrors, clearFieldError, submit } = useServerForm();

  const loadLocals = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listLocals();
      setLocalsList(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadLocals();
  }, [loadLocals]);

  const handleGeocode = async () => {
    if (!formData.address?.trim()) {
      toast({
        title: 'Dirección requerida',
        description: 'Escribe la dirección del local antes de buscar coordenadas.',
        variant: 'destructive',
      });
      return;
    }

    setGeocoding(true);
    try {
      const res = await geocodeAddressAction(formData.address);
      if (res.ok && res.coordinates) {
        setFormData((prev) => ({
          ...prev,
          latitude: res.coordinates!.lat,
          longitude: res.coordinates!.lng,
        }));
        toast({
          title: 'Coordenadas encontradas',
          description: `Lat: ${res.coordinates.lat.toFixed(6)}, Lng: ${res.coordinates.lng.toFixed(6)}`,
        });
      } else {
        toast({
          title: 'No se encontraron coordenadas',
          description: res.error || 'Verifica la dirección o ingrésalas manualmente.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Error de búsqueda',
        description: 'No se pudo obtener las coordenadas de la dirección.',
        variant: 'destructive',
      });
    } finally {
      setGeocoding(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const error = validateLocationSlug(formData.slug);
    if (error) {
      setSlugError(error);
      return;
    }
    setSlugError(null);

    const ok = await submit(async () => {
      if (editingLocal) {
        await updateLocal(editingLocal.id, formData);
        toast({ title: 'Éxito', description: 'Local actualizado' });
      } else {
        await createLocal(formData);
        toast({ title: 'Éxito', description: 'Local creado' });
      }
    });
    if (!ok) return;

    setShowForm(false);
    setEditingLocal(null);
    setFormData(initialFormData);
    loadLocals();
  };

  const handleToggleOpen = async (local: Local) => {
    const newState = !(local.is_open ?? true);
    try {
      setLocalsList((prev) =>
        prev.map((l) => (l.id === local.id ? { ...l, is_open: newState } : l))
      );
      await toggleLocalOpenStatus(local.id, newState);
      toast({
        title: newState ? 'Local abierto' : 'Local cerrado',
        description: `El local "${local.name}" ahora está ${newState ? 'abierto' : 'cerrado'} para pedidos.`,
      });
    } catch {
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado del local.',
        variant: 'destructive',
      });
      loadLocals();
    }
  };

  const handleToggleCatalogMode = async (local: Local) => {
    const newState = !(local.is_catalog_only ?? false);
    try {
      setLocalsList((prev) =>
        prev.map((l) => (l.id === local.id ? { ...l, is_catalog_only: newState } : l))
      );
      await toggleLocalCatalogMode(local.id, newState);
      toast({
        title: newState ? 'Modo Solo Mostrar activado' : 'Modo Pedidos activado',
        description: `El local "${local.name}" ahora está en modo ${newState ? 'catálogo informativo' : 'pedidos activos'}.`,
      });
    } catch {
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el modo del menú.',
        variant: 'destructive',
      });
      loadLocals();
    }
  };

  const handleToggleReservations = async (local: Local) => {
    const newState = !(local.reservations_enabled !== false);
    try {
      setLocalsList((prev) =>
        prev.map((l) => (l.id === local.id ? { ...l, reservations_enabled: newState } : l))
      );
      await toggleLocalReservationsEnabled(local.id, newState);
      toast({
        title: newState ? 'Reservaciones activadas' : 'Reservaciones pausadas',
        description: `Las reservas en línea del local "${local.name}" ahora están ${newState ? 'habilitadas' : 'pausadas'}.`,
      });
    } catch {
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado de las reservaciones.',
        variant: 'destructive',
      });
      loadLocals();
    }
  };

  const handleEdit = (local: Local) => {
    setEditingLocal(local);
    setFormData({
      name: local.name,
      slug: local.slug,
      timezone: local.timezone,
      iva_rate: local.iva_rate,
      delivery_fee: local.delivery_fee,
      address: local.address ?? '',
      latitude: local.latitude ?? null,
      longitude: local.longitude ?? null,
      is_open: local.is_open ?? true,
      is_catalog_only: local.is_catalog_only ?? false,
      reservations_enabled: local.reservations_enabled !== false,
    });
    setSlugError(null);
    setShowForm(true);
  };

  const handleNew = () => {
    setEditingLocal(null);
    setFormData(initialFormData);
    setSlugError(null);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingLocal(null);
    setFormData(initialFormData);
    setSlugError(null);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar el local "${name}"? Esta acción no se puede deshacer y eliminará todos los datos asociados (staff, menú, órdenes, reservas, etc.).`)) return;
    const ok = await submit(async () => {
      await deleteLocal(id);
      toast({ title: 'Eliminado', description: 'Local eliminado correctamente' });
    });
    if (ok) loadLocals();
  };

  if (loading) {
    return <div className="flex justify-center py-8">Cargando locales...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Gestión de Locales</h2>
        <button onClick={handleNew} className="btn-primary">
          + Nuevo Local
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between border-b p-4">
              <h3 className="text-lg font-semibold">
                {editingLocal ? 'Editar Local' : 'Nuevo Local'}
              </h3>
              <button onClick={handleCancel} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <FormAlert message={formError} />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => { setFormData({ ...formData, name: e.target.value }); clearFieldError('name'); }}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
                  required
                  {...fieldAria('local-name-error', !!fieldErrors.name)}
                />
                <FieldError id="local-name-error" message={fieldErrors.name} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ruta (sucursal) *</label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => {
                    const value = e.target.value.toLowerCase();
                    setFormData({ ...formData, slug: value });
                    setSlugError(validateLocationSlug(value));
                    clearFieldError('slug');
                  }}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
                  required
                  disabled={!!editingLocal}
                  placeholder="centro"
                  {...fieldAria('local-slug-error', !!slugError || !!fieldErrors.slug)}
                />
                <p className="mt-1 text-xs text-gray-500">URL pública: <code>tudominio.com/{formData.slug || 'centro'}</code></p>
                {editingLocal && (
                  <p className="mt-1 text-xs text-gray-500">La ruta no se puede cambiar. Elimina y recrea si es necesario.</p>
                )}
                <FieldError id="local-slug-error" message={slugError ?? fieldErrors.slug} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Zona horaria</label>
                  <select
                    value={formData.timezone}
                    onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
                  >
                    <option value="America/Mexico_City">America/Mexico_City</option>
                    <option value="America/Cancun">America/Cancun</option>
                    <option value="America/Merida">America/Merida</option>
                    <option value="America/Monterrey">America/Monterrey</option>
                    <option value="America/Tijuana">America/Tijuana</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">IVA (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={formData.iva_rate}
                    onChange={(e) => { setFormData({ ...formData, iva_rate: parseFloat(e.target.value) || 0 }); clearFieldError('iva_rate'); }}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
                    {...fieldAria('local-iva-error', !!fieldErrors.iva_rate)}
                  />
                  <FieldError id="local-iva-error" message={fieldErrors.iva_rate} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tarifa Delivery ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.delivery_fee}
                  onChange={(e) => { setFormData({ ...formData, delivery_fee: parseFloat(e.target.value) || 0 }); clearFieldError('delivery_fee'); }}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
                  {...fieldAria('local-fee-error', !!fieldErrors.delivery_fee)}
                />
                <FieldError id="local-fee-error" message={fieldErrors.delivery_fee} />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3 bg-gray-50/70">
                <div>
                  <span className="block text-sm font-medium text-gray-800">Abierto para pedidos</span>
                  <span className="block text-xs text-gray-500">
                    Si se desactiva, los clientes verán aviso de cerrado y no podrán ordenar.
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_open}
                    onChange={(e) => setFormData({ ...formData, is_open: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3 bg-gray-50/70">
                <div>
                  <span className="block text-sm font-medium text-gray-800">Modo Solo Mostrar (Catálogo)</span>
                  <span className="block text-xs text-gray-500">
                    Desactiva compras y carrito. El menú funciona únicamente como visualización informativa de platillos y precios.
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_catalog_only}
                    onChange={(e) => setFormData({ ...formData, is_catalog_only: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3 bg-gray-50/70">
                <div>
                  <span className="block text-sm font-medium text-gray-800">Permitir Reservas de Mesa</span>
                  <span className="block text-xs text-gray-500">
                    Si se desactiva, los comensales no podrán reservar mesas en línea para esta sucursal.
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.reservations_enabled}
                    onChange={(e) => setFormData({ ...formData, reservations_enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              <div className="border-t pt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-orange-600" />
                    <span>Ubicación y Coordenadas Geográficas</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleGeocode}
                    disabled={geocoding || !formData.address?.trim()}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-700 disabled:text-gray-400 bg-orange-50 hover:bg-orange-100 disabled:bg-gray-100 px-2.5 py-1 rounded-md transition-colors"
                  >
                    {geocoding ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                    <span>{geocoding ? 'Buscando...' : 'Obtener coordenadas'}</span>
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Dirección física (Calle, Número, Colonia, Ciudad)
                  </label>
                  <input
                    type="text"
                    value={formData.address ?? ''}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Ej. Av. Juárez 70, Centro, Cuauhtémoc, CDMX"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                  />
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Punto de origen para calcular las distancias viales de entrega a domicilio.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Latitud GPS</label>
                    <input
                      type="number"
                      step="any"
                      value={formData.latitude ?? ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          latitude: e.target.value === '' ? null : parseFloat(e.target.value),
                        })
                      }
                      placeholder="19.432608"
                      className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm font-mono focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Longitud GPS</label>
                    <input
                      type="number"
                      step="any"
                      value={formData.longitude ?? ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          longitude: e.target.value === '' ? null : parseFloat(e.target.value),
                        })
                      }
                      placeholder="-99.143612"
                      className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm font-mono focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button type="button" onClick={handleCancel} className="btn-secondary">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Guardando...' : editingLocal ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3 text-sm font-semibold text-gray-500">Nombre</th>
              <th className="text-left p-3 text-sm font-semibold text-gray-500">Ruta</th>
              <th className="text-left p-3 text-sm font-semibold text-gray-500">Ubicación / GPS</th>
              <th className="text-left p-3 text-sm font-semibold text-gray-500">Zona horaria</th>
              <th className="text-left p-3 text-sm font-semibold text-gray-500">IVA</th>
              <th className="text-left p-3 text-sm font-semibold text-gray-500">Delivery</th>
              <th className="text-left p-3 text-sm font-semibold text-gray-500">Estado</th>
              <th className="text-left p-3 text-sm font-semibold text-gray-500">Modo Menú</th>
              <th className="text-left p-3 text-sm font-semibold text-gray-500">Reservas</th>
              <th className="text-left p-3 text-sm font-semibold text-gray-500">Creado</th>
              <th className="text-left p-3 text-sm font-semibold text-gray-500">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {localsList.map((local) => (
              <tr key={local.id} className="hover:bg-gray-50">
                <td className="p-3 font-medium">{local.name}</td>
                <td className="p-3 text-sm text-gray-600 font-mono">/{local.slug}</td>
                <td className="p-3 text-xs text-gray-600 max-w-xs">
                  {local.address ? (
                    <div>
                      <span className="line-clamp-1 text-gray-800 font-medium">{local.address}</span>
                      {local.latitude != null && local.longitude != null ? (
                        <span className="font-mono text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                          GPS: {local.latitude.toFixed(4)}, {local.longitude.toFixed(4)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                          Sin GPS
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-400 italic">Sin dirección</span>
                  )}
                </td>
                <td className="p-3 text-sm text-gray-600">{local.timezone}</td>
                <td className="p-3 text-sm text-gray-600">{local.iva_rate * 100}%</td>
                <td className="p-3 text-sm text-gray-600">${local.delivery_fee.toFixed(2)}</td>
                <td className="p-3">
                  <button
                    type="button"
                    onClick={() => handleToggleOpen(local)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all border ${
                      local.is_open !== false
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                    }`}
                    title="Clic para cambiar estado"
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        local.is_open !== false ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
                      }`}
                    />
                    {local.is_open !== false ? 'Abierto' : 'Cerrado'}
                  </button>
                </td>
                <td className="p-3">
                  <button
                    type="button"
                    onClick={() => handleToggleCatalogMode(local)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all border ${
                      local.is_catalog_only
                        ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    }`}
                    title="Clic para alternar entre Modo Catálogo y Modo Pedidos"
                  >
                    {local.is_catalog_only ? (
                      <Eye className="w-3 h-3 text-amber-600" />
                    ) : (
                      <ShoppingCart className="w-3 h-3 text-emerald-600" />
                    )}
                    {local.is_catalog_only ? 'Catálogo' : 'Pedidos'}
                  </button>
                </td>
                <td className="p-3">
                  <button
                    type="button"
                    onClick={() => handleToggleReservations(local)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all border ${
                      local.reservations_enabled !== false
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-200'
                    }`}
                    title="Clic para alternar reservas públicas"
                  >
                    <Calendar className="w-3 h-3 text-zinc-600" />
                    {local.reservations_enabled !== false ? 'Activas' : 'Pausadas'}
                  </button>
                </td>
                <td className="p-3 text-sm text-gray-500">
                  {new Date(local.created_at).toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(local)}
                      className="text-sm text-primary hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(local.id, local.name)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {localsList.length === 0 && (
              <tr>
                <td colSpan={11} className="p-8 text-center text-gray-400">
                  No hay locales. Crea el primero para empezar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ZoneCapacityEditor />

      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Información</h3>
        <ul className="list-inside list-disc space-y-1 text-sm text-gray-600">
          <li>La <strong>ruta</strong> identifica a la sucursal en la URL pública (ej: <code>tudominio.com/centro</code>). El dominio es irrelevante: cada restaurante usa el suyo.</li>
          <li>La <strong>ubicación y GPS</strong> definen el punto de origen exacto del local para el cálculo de distancias viales de reparto.</li>
          <li>El <strong>IVA</strong> se expresa como decimal (0.16 = 16%). Es el IVA incluido en los precios públicos.</li>
          <li>La <strong>tarifa de delivery</strong> actúa como tarifa base / fallback si un pedido a domicilio no tiene coordenadas válidas.</li>
          <li>Eliminar un local elimina <strong>en cascada</strong> todo: staff, menú, órdenes, reservas, descuentos.</li>
          <li>Cualquier staff autenticado puede gestionar locales.</li>
        </ul>
      </div>
    </div>
  );
}