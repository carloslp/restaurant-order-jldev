'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  listLocals,
  createLocal,
  updateLocal,
  deleteLocal,
  getLocalById,
} from '@/lib/server/locals';
import { useToast } from '@/components/ui/use-toast';
import { FormAlert, FieldError, fieldAria } from '@/components/ui/form-error';
import { useServerForm } from '@/lib/forms';
import { ZoneCapacityEditor } from '@/features/admin/ZoneCapacityEditor';
import { validateLocationSlug } from '@/lib/slugs';

interface Local {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  iva_rate: number;
  delivery_fee: number;
  created_at: string;
  updated_at: string;
}

interface LocalFormData {
  name: string;
  slug: string;
  timezone: string;
  iva_rate: number;
  delivery_fee: number;
}

const initialFormData: LocalFormData = {
  name: '',
  slug: '',
  timezone: 'America/Mexico_City',
  iva_rate: 0.16,
  delivery_fee: 0,
};

export function AdminLocals() {
  const { toast } = useToast();
  const [localsList, setLocalsList] = useState<Local[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingLocal, setEditingLocal] = useState<Local | null>(null);
  const [formData, setFormData] = useState<LocalFormData>(initialFormData);
  const [showForm, setShowForm] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
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

  const handleEdit = (local: Local) => {
    setEditingLocal(local);
    setFormData({
      name: local.name,
      slug: local.slug,
      timezone: local.timezone,
      iva_rate: local.iva_rate,
      delivery_fee: local.delivery_fee,
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
              <th className="text-left p-3 text-sm font-semibold text-gray-500">Zona horaria</th>
              <th className="text-left p-3 text-sm font-semibold text-gray-500">IVA</th>
              <th className="text-left p-3 text-sm font-semibold text-gray-500">Delivery</th>
              <th className="text-left p-3 text-sm font-semibold text-gray-500">Creado</th>
              <th className="text-left p-3 text-sm font-semibold text-gray-500">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {localsList.map((local) => (
              <tr key={local.id} className="hover:bg-gray-50">
                <td className="p-3 font-medium">{local.name}</td>
                <td className="p-3 text-sm text-gray-600 font-mono">/{local.slug}</td>
                <td className="p-3 text-sm text-gray-600">{local.timezone}</td>
                <td className="p-3 text-sm text-gray-600">{local.iva_rate * 100}%</td>
                <td className="p-3 text-sm text-gray-600">${local.delivery_fee.toFixed(2)}</td>
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
                <td colSpan={7} className="p-8 text-center text-gray-400">
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
          <li>El <strong>IVA</strong> se expresa como decimal (0.16 = 16%). Es el IVA incluido en los precios públicos.</li>
          <li>La <strong>tarifa de delivery</strong> es un monto fijo por pedido a domicilio para este local.</li>
          <li>Eliminar un local elimina <strong>en cascada</strong> todo: staff, menú, órdenes, reservas, descuentos.</li>
          <li>Cualquier staff autenticado puede gestionar locales.</li>
        </ul>
      </div>
    </div>
  );
}