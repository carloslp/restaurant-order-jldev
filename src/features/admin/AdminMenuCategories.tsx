// src/features/admin/AdminMenuCategories.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createCategory, updateCategory, deleteCategory, listCategories, uploadMenuImage, deleteMenuImage } from '@/lib/server/menu';
import type { Category } from '@/lib/types';
import { useToast } from '@/components/ui/use-toast';
import { FormAlert, FieldError, fieldAria } from '@/components/ui/form-error';
import { useServerForm } from '@/lib/forms';

interface CategoryFormData {
  name: string;
  description: string;
  image_url: string;
  is_active: boolean;
  sort_order: number;
}

const initialFormData: CategoryFormData = {
  name: '',
  description: '',
  image_url: '',
  is_active: true,
  sort_order: 0,
};

export function AdminMenuCategories() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState<CategoryFormData>(initialFormData);
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { saving, formError, fieldErrors, clearFieldError, submit } = useServerForm();

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const url = await uploadMenuImage(file, 'categories');
      // Limpieza best-effort de la imagen anterior (si era del bucket)
      const previous = formData.image_url;
      setFormData({ ...formData, image_url: url });
      if (previous) {
        try {
          await deleteMenuImage(previous);
        } catch {
          // Si la vieja era externa o ya no existe, ignorar
        }
      }
      toast({ title: 'Éxito', description: 'Imagen subida a Supabase Storage' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = async () => {
    const previous = formData.image_url;
    setFormData({ ...formData, image_url: '' });
    if (previous) {
      try {
        await deleteMenuImage(previous);
      } catch {
        // best-effort
      }
    }
  };

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listCategories();
      setCategories(data);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await submit(async () => {
      if (editingCategory) {
        await updateCategory(editingCategory.id, formData);
        toast({ title: 'Éxito', description: 'Categoría actualizada' });
      } else {
        await createCategory(formData);
        toast({ title: 'Éxito', description: 'Categoría creada' });
      }
    });
    // Conservar valores al fallar: solo limpiar al guardar con éxito.
    if (!ok) return;
    setShowForm(false);
    setEditingCategory(null);
    setFormData(initialFormData);
    loadCategories();
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description ?? '',
      image_url: category.image_url ?? '',
      is_active: category.is_active,
      sort_order: category.sort_order,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta categoría? Los productos asociados se verán afectados.')) return;
    const ok = await submit(async () => {
      await deleteCategory(id);
      toast({ title: 'Eliminado', description: 'Categoría eliminada' });
    });
    if (ok) loadCategories();
  };

  const handleNew = () => {
    setEditingCategory(null);
    setFormData(initialFormData);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingCategory(null);
    setFormData(initialFormData);
  };

  if (loading) {
    return <div className="flex justify-center py-8">Cargando...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Categorías del Menú</h2>
        <button onClick={handleNew} className="btn-primary">
          + Nueva Categoría
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between border-b p-4">
              <h3 className="text-lg font-semibold">{editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}</h3>
              <button onClick={handleCancel} className="text-gray-400 hover:text-gray-600">✕</button>
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
                  {...fieldAria('cat-name-error', !!fieldErrors.name)}
                />
                <FieldError id="cat-name-error" message={fieldErrors.name} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Imagen (opcional)</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageUpload}
                    disabled={uploading}
                    className="hidden"
                    id="category-image"
                  />
                  <label
                    htmlFor="category-image"
                    className="cursor-pointer rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                  >
                    {uploading ? 'Subiendo...' : formData.image_url ? 'Reemplazar' : 'Subir Imagen'}
                  </label>
                  {formData.image_url && (
                    <>
                      <img src={formData.image_url} alt="Preview" className="h-10 w-10 rounded object-cover" />
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Quitar
                      </button>
                    </>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500">JPEG, PNG o WebP · máx. 5MB · Puedes guardar sin imagen</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Orden</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.sort_order}
                    onChange={(e) => { setFormData({ ...formData, sort_order: Number(e.target.value) }); clearFieldError('sort_order'); }}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
                    {...fieldAria('cat-order-error', !!fieldErrors.sort_order)}
                  />
                  <FieldError id="cat-order-error" message={fieldErrors.sort_order} />
                </div>

                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">Activa</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button type="button" onClick={handleCancel} className="btn-secondary">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Guardando...' : editingCategory ? 'Actualizar' : 'Crear'}
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
              <th className="text-left p-3 text-sm font-semibold text-gray-500">Descripción</th>
              <th className="text-left p-3 text-sm font-semibold text-gray-500">Orden</th>
              <th className="text-left p-3 text-sm font-semibold text-gray-500">Estado</th>
              <th className="text-left p-3 text-sm font-semibold text-gray-500">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {categories.map((cat) => (
              <tr key={cat.id} className="hover:bg-gray-50">
                <td className="p-3 font-medium">{cat.name}</td>
                <td className="p-3 text-sm text-gray-600 max-w-xs truncate">{cat.description ?? '-'}</td>
                <td className="p-3 text-sm">
                  <input
                    type="number"
                    min="0"
                    value={cat.sort_order}
                    onChange={(e) => updateCategory(cat.id, { ...cat, sort_order: Number(e.target.value) })}
                    className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm"
                  />
                </td>
                <td className="p-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cat.is_active}
                      onChange={(e) => updateCategory(cat.id, { ...cat, is_active: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">{cat.is_active ? 'Activa' : 'Inactiva'}</span>
                  </label>
                </td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(cat)}
                      className="text-sm text-primary hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(cat.id)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-400">
                  No hay categorías. Crea la primera para empezar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}