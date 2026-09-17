// src/features/admin/AdminModifierGroups.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { listModifierGroups, createModifierGroup, updateModifierGroup, deleteModifierGroup, createModifierOption, updateModifierOption, deleteModifierOption } from '@/lib/server/menu';
import { toast } from '@/components/ui/use-toast';

interface ModifierGroupFormData {
  name: string;
  is_required: boolean;
  min_selections: number;
  max_selections: number;
}

export function AdminModifierGroups({ productId }: { productId: string }) {
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
    setSaving(true);
    try {
      if (editingGroupId) {
        await updateModifierGroup(editingGroupId, { ...groupFormData, product_id: productId });
      } else {
        await createModifierGroup({ ...groupFormData, product_id: productId });
      }
      toast({ title: 'Éxito', description: 'Grupo actualizado' });
      setShowGroupForm(false);
      setEditingGroupId(null);
      loadGroups();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddOption = async (groupId: string) => {
    const name = prompt('Nombre de la opción:');
    const price = prompt('Impacto de precio (ej: 1.50):');
    if (!name) return;

    try {
      await createModifierOption({
        modifier_group_id: groupId,
        name,
        price_impact: Number(price || 0),
        is_active: true,
      });
      toast({ title: 'Éxito', description: 'Opción añadida' });
      loadGroups();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleUpdateOption = async (optionId: string, current: any) => {
    const name = prompt('Nuevo nombre:', current.name);
    const price = prompt('Nuevo precio:', current.price_impact);
    if (name === null) return;

    try {
      await updateModifierOption(optionId, {
        modifier_group_id: current.modifier_group_id,
        name,
        price_impact: Number(price || 0),
        is_active: current.is_active,
      });
      toast({ title: 'Éxito', description: 'Opción actualizada' });
      loadGroups();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleDeleteOption = async (optionId: string) => {
    if (!confirm('¿Eliminar esta opción?')) return;
    try {
      await deleteModifierOption(optionId);
      toast({ title: 'Eliminado', description: 'Opción eliminada' });
      loadGroups();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
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
                  onClick={async () => {
                    if(confirm('¿Eliminar grupo y todas sus opciones?')) {
                      await deleteModifierGroup(group.id);
                      toast({ title: 'Eliminado', description: 'Grupo eliminado' });
                      loadGroups();
                    }
                  }}
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
                          <button onClick={() => handleUpdateOption(opt.id, opt)} className="text-primary hover:underline">Editar</button>
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
                onClick={() => handleAddOption(group.id)} 
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
    </div>
  );
}
