// src/features/admin/AdminMenuProducts.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { listProducts, createProduct, updateProduct, deleteProduct, uploadMenuImage, deleteMenuImage } from '@/lib/server/menu';
import { listCategories } from '@/lib/server/menu';
import type { Product, Category, Local } from '@/lib/types';
import { useToast } from '@/components/ui/use-toast';
import { FormAlert, FieldError, fieldAria } from '@/components/ui/form-error';
import { useServerForm } from '@/lib/forms';
import { AdminModifierGroups } from '@/features/admin/AdminModifierGroups';
import { compressImageToWebP } from '@/lib/image-compression';

const STANDARD_ALLERGENS = [
  'GLUTEN', 'LACTEOS', 'HUEVO', 'PESCADO', 'SOJA', 'FRUTOS_SECOS', 'CACAHUATE', 'MARISCOS'
];

const STANDARD_DIET_LABELS = [
  'VEGETARIANO', 'VEGANO', 'SIN_GLUTEN', 'SIN_LACTOSA', 'PICANTE'
];

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

interface AdminMenuProductsProps {
  local: Local | null;
}

export function AdminMenuProducts({ local }: AdminMenuProductsProps) {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [modifierModalProduct, setModifierModalProduct] = useState<Product | null>(null);
  const [activeProductTab, setActiveProductTab] = useState<'data' | 'modifiers'>('data');
  const [formData, setFormData] = useState<ProductFormData>(initialFormData);
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { saving, formError, fieldErrors, clearFieldError, submit } = useServerForm();

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

  // Header contextual con información del local
  const renderLocalHeader = () => {
    if (!local) {
      return (
        <div className="mb-6 p-4 rounded-xl bg-yellow-50 border border-yellow-200">
          <div className="flex items-center gap-3">
            <span className="text-yellow-600">⚠️</span>
            <div>
              <p className="font-medium text-yellow-800">Local no resuelto</p>
              <p className="text-sm text-yellow-700">No se pudo determinar el local actual. Verifica tu sesión o contacta al administrador.</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="mb-6 p-4 rounded-xl bg-blue-50 border border-blue-200">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-blue-600">📍</span>
            <span className="font-medium text-blue-800">Editando: {local.name}</span>
          </div>
          <div className="flex items-center gap-1 text-blue-700">
            <span className="font-mono">/{local.slug}</span>
          </div>
          <div className="flex items-center gap-1 text-blue-700">
            <span>IVA {(local.iva_rate * 100).toFixed(0)}%</span>
          </div>
          <div className="flex items-center gap-1 text-blue-700">
            <span>Envío ${local.delivery_fee.toFixed(2)}</span>
          </div>
          <a
            href={`/${local.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
          >
            Ver menú público →
          </a>
        </div>
      </div>
    );
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const optimizedFile = await compressImageToWebP(file);
      const url = await uploadMenuImage(optimizedFile, 'products');
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
    const ok = await submit(async () => {
      if (editingProduct) {
        await updateProduct(editingProduct.id, formData);
        toast({ title: 'Éxito', description: 'Producto actualizado' });
      } else {
        await createProduct(formData);
        toast({ title: 'Éxito', description: 'Producto creado' });
      }
    });
    if (!ok) return;

    // Verificar visibilidad en el menú público después de guardar
    const selectedCategory = categories.find(c => c.id === formData.category_id);
    if (selectedCategory) {
      if (!selectedCategory.is_active) {
        toast({
          title: '⚠️ Producto no visible en menú público',
          description: `La categoría "${selectedCategory.name}" está inactiva. El producto no aparecerá para los clientes.`,
          variant: 'default',
        });
      } else if (!formData.is_available) {
        toast({
          title: '⚠️ Producto no visible en menú público',
          description: 'El producto está marcado como "Agotado". No aparecerá para los clientes hasta que lo actives.',
          variant: 'default',
        });
      }
    }

    setShowForm(false);
    setEditingProduct(null);
    setFormData(initialFormData);
    loadData();
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setActiveProductTab('data');
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
    const ok = await submit(async () => {
      await deleteProduct(id);
      toast({ title: 'Eliminado', description: 'Producto eliminado' });
    });
    if (ok) loadData();
  };

  const handleNew = () => {
    setEditingProduct(null);
    setActiveProductTab('data');
    setFormData(initialFormData);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingProduct(null);
    setActiveProductTab('data');
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
      {renderLocalHeader()}
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

            {editingProduct && (
              <div className="flex border-b border-zinc-200 px-4 bg-zinc-50">
                <button
                  type="button"
                  onClick={() => setActiveProductTab('data')}
                  className={`py-2.5 px-4 text-xs sm:text-sm font-semibold border-b-2 transition-all cursor-pointer ${
                    activeProductTab === 'data'
                      ? 'border-orange-600 text-orange-600 bg-white'
                      : 'border-transparent text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  📋 Datos del Producto
                </button>
                <button
                  type="button"
                  onClick={() => setActiveProductTab('modifiers')}
                  className={`py-2.5 px-4 text-xs sm:text-sm font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeProductTab === 'modifiers'
                      ? 'border-orange-600 text-orange-600 bg-white'
                      : 'border-transparent text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  <span>⚙️ Modificadores</span>
                  {editingProduct.modifier_groups?.length ? (
                    <span className="bg-orange-100 text-orange-800 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {editingProduct.modifier_groups.length}
                    </span>
                  ) : null}
                </button>
              </div>
            )}

            {activeProductTab === 'modifiers' && editingProduct ? (
              <div className="p-4 sm:p-6 space-y-4">
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-xs text-orange-900">
                  Agrega y configura los grupos de opciones (término, salsas, extras, complementos) para <strong>{editingProduct.name}</strong>.
                </div>
                <AdminModifierGroups productId={editingProduct.id} />
                <div className="flex justify-end pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditingProduct(null);
                      loadData();
                    }}
                    className="btn-primary text-xs"
                  >
                    Guardar y Cerrar
                  </button>
                </div>
              </div>
            ) : (
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <FormAlert message={formError} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => { setFormData({ ...formData, name: e.target.value }); clearFieldError('name'); }}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
                      required
                      {...fieldAria('prod-name-error', !!fieldErrors.name)}
                    />
                    <FieldError id="prod-name-error" message={fieldErrors.name} />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Categoría *</label>
                    <select
                      value={formData.category_id}
                      onChange={(e) => { setFormData({ ...formData, category_id: e.target.value }); clearFieldError('category_id'); }}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
                      required
                      {...fieldAria('prod-category-error', !!fieldErrors.category_id)}
                    >
                      <option value="">Selecciona una categoría</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                    <FieldError id="prod-category-error" message={fieldErrors.category_id} />
                    {categories.length === 0 && (
                      <p className="mt-1 text-xs text-amber-600">
                        No hay categorías en este local. Crea una en la sección de categorías.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Precio Base ($) *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.base_price}
                      onChange={(e) => { setFormData({ ...formData, base_price: Number(e.target.value) }); clearFieldError('base_price'); }}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
                      required
                      {...fieldAria('prod-price-error', !!fieldErrors.base_price)}
                    />
                    <FieldError id="prod-price-error" message={fieldErrors.base_price} />
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
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Alérgenos</label>
                    <div className="flex flex-wrap gap-1.5 mb-2.5">
                      {STANDARD_ALLERGENS.map((allergen) => {
                        const isSelected = (formData.allergens || []).some(
                          (a) => a.toUpperCase() === allergen
                        );
                        return (
                          <button
                            key={allergen}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setFormData((prev) => ({
                                  ...prev,
                                  allergens: (prev.allergens || []).filter(
                                    (a) => a.toUpperCase() !== allergen
                                  ),
                                }));
                              } else {
                                setFormData((prev) => ({
                                  ...prev,
                                  allergens: [...(prev.allergens || []), allergen],
                                }));
                              }
                            }}
                            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer select-none ${
                              isSelected
                                ? 'bg-orange-600 text-white shadow-xs'
                                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                            }`}
                          >
                            {isSelected ? `✓ ${allergen}` : allergen}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        placeholder="Otro alérgeno (Enter para agregar)..."
                        className="flex-1 rounded-xl border border-gray-300 px-3 py-1.5 text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const target = e.currentTarget;
                            if (target.value.trim()) {
                              addTag('allergens', target.value);
                              target.value = '';
                            }
                          }
                        }}
                      />
                    </div>
                    {/* Alérgenos personalizados adicionales */}
                    <div className="flex flex-wrap gap-1">
                      {(formData.allergens || [])
                        .filter((a) => !STANDARD_ALLERGENS.includes(a.toUpperCase()))
                        .map((tag, i) => (
                          <span key={i} className="bg-amber-100 text-amber-900 text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 font-medium">
                            {tag}
                            <button type="button" onClick={() => removeTag('allergens', i)} className="text-amber-700 hover:text-amber-950 cursor-pointer">✕</button>
                          </span>
                        ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Etiquetas Dietéticas</label>
                    <div className="flex flex-wrap gap-1.5 mb-2.5">
                      {STANDARD_DIET_LABELS.map((label) => {
                        const isSelected = (formData.diet_labels || []).some(
                          (d) => d.toUpperCase() === label
                        );
                        return (
                          <button
                            key={label}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setFormData((prev) => ({
                                  ...prev,
                                  diet_labels: (prev.diet_labels || []).filter(
                                    (d) => d.toUpperCase() !== label
                                  ),
                                }));
                              } else {
                                setFormData((prev) => ({
                                  ...prev,
                                  diet_labels: [...(prev.diet_labels || []), label],
                                }));
                              }
                            }}
                            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer select-none ${
                              isSelected
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                            }`}
                          >
                            {isSelected ? `✓ ${label}` : label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        placeholder="Otra etiqueta dietética (Enter para agregar)..."
                        className="flex-1 rounded-xl border border-gray-300 px-3 py-1.5 text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const target = e.currentTarget;
                            if (target.value.trim()) {
                              addTag('diet_labels', target.value);
                              target.value = '';
                            }
                          }
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(formData.diet_labels || [])
                        .filter((d) => !STANDARD_DIET_LABELS.includes(d.toUpperCase()))
                        .map((tag, i) => (
                          <span key={i} className="bg-emerald-100 text-emerald-900 text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 font-medium">
                            {tag}
                            <button type="button" onClick={() => removeTag('diet_labels', i)} className="text-emerald-700 hover:text-emerald-950 cursor-pointer">✕</button>
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
            )}
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
              <th className="p-3 text-sm font-semibold text-gray-500">Modificadores</th>
              <th className="p-3 text-sm font-semibold text-gray-500">Estado</th>
              <th className="p-3 text-sm font-semibold text-gray-500">Visibilidad</th>
              <th className="p-3 text-sm font-semibold text-gray-500">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {products.map((prod) => {
              const category = categories.find(c => c.id === prod.category_id);
              const isVisibleInPublic = category?.is_active && prod.is_available;
              return (
                <tr key={prod.id} className={`hover:bg-gray-50 ${!isVisibleInPublic ? 'bg-yellow-50' : ''}`}>
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
                    {category?.name || 'Sin categoría'}
                    {!category?.is_active && (
                      <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-800">
                        Inactiva
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-sm font-medium">${prod.base_price.toFixed(2)}</td>
                  <td className="p-3 text-xs">
                    {prod.modifier_groups && prod.modifier_groups.length > 0 ? (
                      <div className="space-y-1">
                        <div className="flex flex-wrap gap-1">
                          {prod.modifier_groups.slice(0, 2).map((g) => (
                            <span
                              key={g.id}
                              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-orange-50 text-orange-800 border border-orange-200"
                            >
                              {g.name} {g.options?.length ? `(${g.options.length})` : ''}
                            </span>
                          ))}
                          {prod.modifier_groups.length > 2 && (
                            <span className="text-[10px] text-zinc-500 font-medium self-center">
                              +{prod.modifier_groups.length - 2} más
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setModifierModalProduct(prod)}
                          className="text-orange-600 hover:text-orange-700 font-semibold hover:underline block text-[11px] cursor-pointer"
                        >
                          Configurar ({prod.modifier_groups.length})
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setModifierModalProduct(prod)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-orange-600 bg-zinc-50 hover:bg-orange-50 border border-dashed border-zinc-300 hover:border-orange-300 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                      >
                        <span>+ Añadir</span>
                      </button>
                    )}
                  </td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${prod.is_available ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {prod.is_available ? 'Disponible' : 'Agotado'}
                    </span>
                  </td>
                  <td className="p-3">
                    {isVisibleInPublic ? (
                      <span className="text-xs text-green-600 font-medium">Visible en público ✓</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-red-600 font-medium">No visible en público</span>
                        {!category?.is_active && (
                          <span className="text-[10px] text-yellow-700">Categoría inactiva</span>
                        )}
                        {!prod.is_available && (
                          <span className="text-[10px] text-red-700">Producto agotado</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2 flex-wrap items-center">
                      <button
                        type="button"
                        onClick={() => handleEdit(prod)}
                        className="text-xs font-semibold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setModifierModalProduct(prod)}
                        className="text-xs font-semibold text-zinc-700 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 px-2.5 py-1 rounded-lg border border-zinc-200 transition-colors cursor-pointer"
                        title="Gestionar grupos de modificadores y opciones"
                      >
                        Modificadores {prod.modifier_groups?.length ? `(${prod.modifier_groups.length})` : ''}
                      </button>
                      {local && isVisibleInPublic && (
                        <a
                          href={`/${local.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
                        >
                          Ver menú →
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(prod.id)}
                        className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {products.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-gray-400">
                  No hay productos. Crea el primero para empezar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de Modificadores para el producto seleccionado */}
      {modifierModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 sm:p-6 border border-zinc-200">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-200 mb-5">
              <div>
                <h3 className="text-lg font-bold text-zinc-900">
                  Modificadores: {modifierModalProduct.name}
                </h3>
                <p className="text-xs text-zinc-500">
                  Configura grupos obligatorios (ej. término, salsa) y opciones con costo extra.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModifierModalProduct(null);
                  loadData();
                }}
                className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-600 hover:text-zinc-900 flex items-center justify-center font-bold text-sm transition-colors cursor-pointer"
                title="Cerrar modal de modificadores"
              >
                ✕
              </button>
            </div>
            <AdminModifierGroups productId={modifierModalProduct.id} />
          </div>
        </div>
      )}
    </div>
  );
}
