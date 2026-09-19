// src/features/admin/AdminModifierGroups.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { listModifierGroups, createModifierGroup, updateModifierGroup, deleteModifierGroup, createModifierOption, updateModifierOption, deleteModifierOption } from '@/lib/server/menu';
import { useToast } from '@/components/ui/use-toast';
import { FormAlert, FieldError, fieldAria } from '@/components/ui/form-error';
import { useServerForm } from '@/lib/forms';

interface ModifierGroupFormData {
  name: string;
  is_required: boolean;
  min_selections: number;
  max_selections: number;
}

interface OptionDraft {
  groupId: string;
  optionId: string | null;
  name: string;
  price: string;
}

export function AdminModifierGroups({ productId }: { productId: string }) {
  const { toast } = useToast();
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupFormData, setGroupFormData] = useState({
    name: '',
    is_required: true,
    min_selections: 0,
    max_selections: 0,
  });
  // Modal de opción (reemplaza prompt() que no valida y no muestra errores).
  const [optionDraft, setOptionDraft] = useState<OptionDraft | null>(null);
  const [optionError, setOptionError] = useState<string | null>(null);
  const { formError, fieldErrors, clearFieldError, submit } = useServerForm();

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listModifierGroups(productId);
      setGroups(data);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await submit(async () => {
      if (editingGroupId) {
        await updateModifierGroup(editingGroupId, { ...groupFormData, product_id: productId });
      } else {
        await createModifierGroup({ ...groupFormData, product_id: productId });
      }
      toast({ title: 'Éxito', description: 'Grupo guardado' });
    });
    if (!ok) return;
    setShowGroupForm(false);
    setEditingGroupId(null);
    loadGroups();
  };

  const openAddOption = (groupId: string) => {
    setOptionError(null);
    setOptionDraft({ groupId, optionId: null, name: '', price: '' });
  };

  const openEditOption = (groupId: string, option: any) => {
    setOptionError(null);
    setOptionDraft({ groupId, optionId: option.id, name: option.name, price: String(option.price_impact ?? 0) });
  };

  const handleSaveOption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!optionDraft) return;
    const price = parseFloat(optionDraft.price);
    if (!optionDraft.name.trim()) {
      setOptionError('El nombre de la opción es requerido.');
      return;
    }
    if (isNaN(price)) {
      setOptionError('El impacto de precio debe ser un número (ej: 1.50).');
      return;
    }
    const ok = await submit(async () => {
      if (optionDraft.optionId) {
        await updateModifierOption(optionDraft.optionId, {
          modifier_group_id: optionDraft.groupId,
          name: optionDraft.name.trim(),
          price_impact: price,
          is_active: true,
        });
      } else {
        await createModifierOption({
          modifier_group_id: optionDraft.groupId,
          name: optionDraft.name.trim(),
          price_impact: price,
          is_active: true,
        });
      }
      toast({ title: 'Éxito', description: 'Opción guardada' });
    });
    if (!ok) return;
    setOptionDraft(null);
    loadGroups();
  };

  const handleDeleteOption = async (optionId: string) => {
    if (!confirm('¿Eliminar esta opción?')) return;
    const ok = await submit(async () => {
      await deleteModifierOption(optionId);
      toast({ title: 'Eliminado', description: 'Opción eliminada' });
    });
    if (ok) loadGroups();
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('¿Eliminar grupo y todas sus opciones?')) return;
    const ok = await submit(async () => {
      await deleteModifierGroup(groupId);
      toast({ title: 'Eliminado', description: 'Grupo eliminado' });
    });
    if (ok) loadGroups();
  };

  if (loading) return <div className="text-center py-4">Cargando modificadores...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Configuración de Modificadores</h3>
        <button 
          onClick={() => {
            setEditingGroupId(null);
            setGroupFormData({ name: '', is_required: true, min_selections: 0, max_selections: 0 });
            setShowGroupForm(true);
          }} 
          className="btn-primary text-sm"
        >
          + Añadir Grupo
        </button>
      </div>

      {showGroupForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h4 className="text-lg font-bold mb-4">{editingGroupId ? 'Editar Grupo' : 'Nuevo Grupo'}</h4>
            <form onSubmit={handleSaveGroup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nombre del Grupo *</label>
                <input
                  type="text"
                  value={groupFormData.name}
                  onChange={e => setGroupFormData({...groupFormData, name: e.target.value})}
                  className="w-full border p-2 rounded"
                  required
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={groupFormData.is_required}
                  onChange={e => setGroupFormData({...groupFormData, is_required: e.target.checked})}
                  id="is_required"
                />
                <label htmlFor="is_required" className="text-sm">Obligatorio</label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Mínimo</label>
                  <input
                    type="number"
                    value={groupFormData.min_selections}
                    onChange={e => setGroupFormData({...groupFormData, min_selections: Number(e.target.value)})}
                    className="w-full border p-2 rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Máximo (0 = sin límite)</label>
                  <input
                    type="number"
                    value={groupFormData.max_selections}
                    onChange={e => setGroupFormData({...groupFormData, max_selections: Number(e.target.value)})}
                    className="w-full border p-2 rounded"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button type="button" onClick={() => setShowGroupForm(false)} className="btn-secondary">Cancelar</button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Guardando...' : 'Guardar Grupo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {groups.map(group => (
          <div key={group.id} className="border rounded-xl bg-white overflow-hidden shadow-sm">
            <div className="bg-gray-50 p-3 border-b flex justify-between items-center">
              <div>
                <span className="font-bold">{group.name}</span>
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${group.is_required ? 'bg-orange-100 text-orange-800' : 'bg-gray-200 text-gray-700'}`}>
                  {group.is_required ? 'Obligatorio' : 'Opcional'}
                </span>
                <span className="ml-2 text-xs text-gray-500">
                  Min: {group.min_selections} / Max: {group.max_selections || '∞'}
                </span>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    setEditingGroupId(group.id);
                    setGroupFormData({
                      name: group.name,
                      is_required: group.is_required,
                      min_selections: group.min_selections,
                      max_selections: group.max_selections,
                    });
                    setShowGroupForm(true);
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  Editar
                </button>
                <button 
                  onClick={() => handleDeleteGroup(group.id)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Eliminar
                </button>
              </div>
            </div>
            <div className="p-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2 font-medium">Opción</th>
                    <th className="pb-2 font-medium">Precio</th>
                    <th className="pb-2 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {group.options?.map((opt: any) => (
                    <tr key={opt.id} className="group">
                      <td className="py-2">{opt.name}</td>
                      <td className="py-2">${opt.price_impact.toFixed(2)}</td>
                      <td className="py-2 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEditOption(group.id, opt)} className="text-primary hover:underline">Editar</button>
                        <button onClick={() => handleDeleteOption(opt.id)} className="text-red-600 hover:underline">Borrar</button>
                      </div>
                      </td>
                    </tr>
                  ))}
                  {(!group.options || group.options.length === 0) && (
                    <tr>
                      <td colSpan={3} className="py-4 text-center text-gray-400 italic">Sin opciones configuradas</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <button 
                onClick={() => openAddOption(group.id)} 
                className="mt-3 w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-primary hover:text-primary transition-colors"
              >
                + Añadir Opción
              </button>
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <div className="text-center py-12 border-2 border-dashed rounded-xl text-gray-400">
            No hay grupos de modificadores para este producto.
          </div>
        )}
      </div>

      {/* Modal de opción (antes: prompt() sin validación ni errores) */}
      {optionDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between border-b p-4">
              <h3 className="text-lg font-semibold">
                {optionDraft.optionId ? 'Editar Opción' : 'Nueva Opción'}
              </h3>
              <button
                onClick={() => setOptionDraft(null)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveOption} className="p-4 space-y-4">
              <FormAlert message={optionError ?? formError} />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={optionDraft.name}
                  onChange={(e) => { setOptionDraft({ ...optionDraft, name: e.target.value }); setOptionError(null); }}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
                  required
                  autoFocus
                  {...fieldAria('opt-name-error', !!fieldErrors.name)}
                />
                <FieldError id="opt-name-error" message={fieldErrors.name} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Impacto de precio ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={optionDraft.price}
                  onChange={(e) => { setOptionDraft({ ...optionDraft, price: e.target.value }); setOptionError(null); }}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
                  placeholder="0.00"
                />
                <p className="mt-1 text-xs text-gray-500">Use negativo para descuentos (ej: -1.50).</p>
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t">
                <button type="button" onClick={() => setOptionDraft(null)} className="btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
