// src/features/admin/AdminMenuProducts.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { listProducts, createProduct, updateProduct, deleteProduct, uploadMenuImage, deleteMenuImage } from '@/lib/server/menu';
import { listCategories } from '@/lib/server/menu';
import type { Product, Category } from '@/lib/types';
import { useToast } from '@/components/ui/use-toast';

interface ProductFormData {
  name: string;
  description: string;
  category_id: string;
  base_price: number;
  image_url: string;
  is_available: boolean;
  allergens: string[];
  diet_labels: string[];
}

const initialFormData: ProductFormData = {
  name: '',
  description: '',
  category_id: '',
  base_price: 0,
  image_url: '',
  is_available: true,
  allergens: [],
  diet_labels: [],
};

export function AdminMenuProducts() {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(initialFormData);
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Cargas independientes: si falla productos, igual se muestran categorías y viceversa.
      const [productsRes, categoriesRes] = await Promise.allSettled([
        listProducts(),
        listCategories(),
      ]);
      if (productsRes.status === 'fulfilled') {
        setProducts(productsRes.value);
      } else {
        toast({ title: 'Error al cargar productos', description: productsRes.reason?.message ?? 'Error desconocido', variant: 'destructive' });
      }
      if (categoriesRes.status === 'fulfilled') {
        setCategories(categoriesRes.value);
      } else {
        toast({ title: 'Error al cargar categorías', description: categoriesRes.reason?.message ?? 'Error desconocido', variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const url = await uploadMenuImage(file, 'products');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, formData);
        toast({ title: 'Éxito', description: 'Producto actualizado' });
      } else {
        await createProduct(formData);
        toast({ title: 'Éxito', description: 'Producto creado' });
      }
      setShowForm(false);
      setEditingProduct(null);
      setFormData(initialFormData);
      loadData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description ?? '',
      category_id: product.category_id,
      base_price: product.base_price,
      image_url: product.image_url ?? '',
      is_available: product.is_available,
      allergens: product.allergens ?? [],
      diet_labels: product.diet_labels ?? [],
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este producto?')) return;
    try {
      await deleteProduct(id);
      toast({ title: 'Eliminado', description: 'Producto eliminado' });
      loadData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleNew = () => {
    setEditingProduct(null);
    setFormData(initialFormData);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingProduct(null);
    setFormData(initialFormData);
  };

  const addTag = (type: 'allergens' | 'diet_labels', value: string) => {
    if (!value.trim()) return;
    setFormData(prev => ({
      ...prev,
      [type]: [...(prev[type] || []), value.trim()]
    }));
  };

  const removeTag = (type: 'allergens' | 'diet_labels', index: number) => {
    setFormData(prev => ({
      ...prev,
      [type]: prev[type].filter((_, i) => i !== index)
    }));
  };

  if (loading) return <div className="flex justify-center py-8">Cargando productos...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Productos del Menú</h2>
        <button onClick={handleNew} className="btn-primary">
          + Nuevo Producto
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between border-b p-4">
              <h3 className="text-lg font-semibold">{editingProduct ? 'Editar Producto' : 'Nuevo Producto'}</h3>
              <button onClick={handleCancel} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Categoría *</label>
                    <select
                      value={formData.category_id}
                      onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
                      required
                    >
                      <option value="">Selecciona una categoría</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Precio Base ($) *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.base_price}
                      onChange={(e) => setFormData({ ...formData, base_price: Number(e.target.value) })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
                      required
                    />
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
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Imagen (opcional)</label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleImageUpload}
                        disabled={uploading}
                        className="hidden"
                        id="product-image"
                      />
                      <label
                        htmlFor="product-image"
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

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is_available"
                      checked={formData.is_available}
                      onChange={(e) => setFormData({ ...formData, is_available: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    <label htmlFor="is_available" className="text-sm font-medium text-gray-700">Disponible en el menú</label>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Alérgenos</label>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        placeholder="Ej: Gluten, Lácteos"
                        className="flex-1 rounded-md border border-gray-300 px-3 py-1 text-sm"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const target = e.currentTarget;
                            addTag('allergens', target.value);
                            target.value = '';
                          }
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {formData.allergens.map((tag, i) => (
                        <span key={i} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                          {tag}
                          <button type="button" onClick={() => removeTag('allergens', i)} className="hover:text-blue-600">✕</button>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Etiquetas Dietéticas</label>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        placeholder="Ej: Vegano, Keto"
                        className="flex-1 rounded-md border border-gray-300 px-3 py-1 text-sm"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const target = e.currentTarget;
                            addTag('diet_labels', target.value);
                            target.value = '';
                          }
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {formData.diet_labels.map((tag, i) => (
                        <span key={i} className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                          {tag}
                          <button type="button" onClick={() => removeTag('diet_labels', i)} className="hover:text-green-600">✕</button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button type="button" onClick={handleCancel} className="btn-secondary">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Guardando...' : editingProduct ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr className="text-left">
              <th className="p-3 text-sm font-semibold text-gray-500">Imagen</th>
              <th className="p-3 text-sm font-semibold text-gray-500">Producto</th>
              <th className="p-3 text-sm font-semibold text-gray-500">Categoría</th>
              <th className="p-3 text-sm font-semibold text-gray-500">Precio</th>
              <th className="p-3 text-sm font-semibold text-gray-500">Estado</th>
              <th className="p-3 text-sm font-semibold text-gray-500">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {products.map((prod) => (
              <tr key={prod.id} className="hover:bg-gray-50">
                <td className="p-3">
                  {prod.image_url ? (
                    <img src={prod.image_url} alt={prod.name} className="h-10 w-10 rounded object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded bg-gray-100 flex items-center justify-center text-gray-400 text-xs">No Img</div>
                  )}
                </td>
                <td className="p-3">
                  <div className="font-medium">{prod.name}</div>
                  <div className="text-xs text-gray-500 truncate max-w-[200px]">{prod.description}</div>
                </td>
                <td className="p-3 text-sm text-gray-600">
                  {categories.find(c => c.id === prod.category_id)?.name || 'Sin categoría'}
                </td>
                <td className="p-3 text-sm font-medium">${prod.base_price.toFixed(2)}</td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${prod.is_available ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {prod.is_available ? 'Disponible' : 'Agotado'}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex gap-3">
                    <button onClick={() => handleEdit(prod)} className="text-sm text-primary hover:underline">
                      Editar
                    </button>
                    <button onClick={() => handleDelete(prod.id)} className="text-sm text-red-600 hover:underline">
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-400">
                  No hay productos. Crea el primero para empezar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
