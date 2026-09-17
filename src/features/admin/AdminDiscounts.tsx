// src/features/admin/AdminDiscounts.tsx
'use client';

import { useState, useEffect } from 'react';
import type { Discount } from '@/lib/types';
import {
  listDiscounts,
  createDiscount,
  updateDiscount,
  deleteDiscount,
  toggleDiscountStatus,
} from '@/lib/server/discounts';
import { z } from 'zod';
import { DiscountSchema } from '@/lib/validation';

interface DiscountFormState {
  description: string;
  discount_type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  value: string;
  min_purchase: string;
  code: string | null;
  applies_to_product_ids: string[];
  applies_to_category_ids: string[];
  starts_at: string | null;
  ends_at: string | null;
  days_of_week: number[];
  time_of_day_start: string | null;
  time_of_day_end: string | null;
  usage_limit_total: string | null;
  usage_limit_per_customer: string | null;
  usage_limit_per_day: string | null;
  is_active: boolean;
}

export function AdminDiscounts() {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<DiscountFormState>(initialFormState());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch discounts on mount and when needed
  useEffect(() => {
    fetchDiscounts();
  }, []);

  async function fetchDiscounts() {
    setLoading(true);
    setError(null);
    try {
      const data = await listDiscounts();
      setDiscounts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  }

  function handleCheckboxChange(
    e: React.ChangeEvent<HTMLInputElement>,
    field: keyof DiscountFormState
  ) {
    const { checked, value } = e.target;
    setFormData(prev => {
      const current = prev[field] as unknown as string[];
      if (checked) {
        return { ...prev, [field]: [...current, value] as unknown as DiscountFormState[typeof field] };
      } else {
        return { ...prev, [field]: current.filter((v: string) => v !== value) as unknown as DiscountFormState[typeof field] };
      }
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Convert empty strings to null for optional fields
      const payload = {
        ...formData,
        min_purchase: formData.min_purchase === '' ? '0' : formData.min_purchase,
        code: formData.code === '' ? null : formData.code,
        starts_at: formData.starts_at ?? null,
        ends_at: formData.ends_at ?? null,
        time_of_day_start: formData.time_of_day_start ?? null,
        time_of_day_end: formData.time_of_day_end ?? null,
        usage_limit_total: formData.usage_limit_total === '' ? null : formData.usage_limit_total,
        usage_limit_per_customer: formData.usage_limit_per_customer === '' ? null : formData.usage_limit_per_customer,
        usage_limit_per_day: formData.usage_limit_per_day === '' ? null : formData.usage_limit_per_day,
        applies_to_product_ids: formData.applies_to_product_ids,
        applies_to_category_ids: formData.applies_to_category_ids,
        days_of_week: formData.days_of_week.length > 0 ? formData.days_of_week : null,
        value: parseFloat(formData.value),
        min_purchase: parseFloat(formData.min_purchase),
      };

      if (editingId) {
        updateDiscount(editingId, payload);
      } else {
        createDiscount(payload);
      }

      setFormData(initialFormState());
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de validación');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleEdit(discount: Discount) {
    setEditingId(discount.id);
    setFormData({
      description: discount.description,
      discount_type: discount.discount_type,
      value: discount.value.toString(),
      min_purchase: discount.min_purchase.toString(),
      code: discount.code ?? '',
      applies_to_product_ids: discount.applies_to_product_ids ?? [],
      applies_to_category_ids: discount.applies_to_category_ids ?? [],
      starts_at: discount.starts_at ?? null,
      ends_at: discount.ends_at ?? null,
      days_of_week: discount.days_of_week ?? [],
      time_of_day_start: discount.time_of_day_start ? new Date(discount.time_of_day_start).toTimeString().slice(0, 5) : null,
      time_of_day_end: discount.time_of_day_end ? new Date(discount.time_of_day_end).toTimeString().slice(0, 5) : null,
      usage_limit_total: discount.usage_limit_total ?? null,
      usage_limit_per_customer: discount.usage_limit_per_customer ?? null,
      usage_limit_per_day: discount.usage_limit_per_day ?? null,
      is_active: discount.is_active,
    });
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Estás seguro de eliminar esta promoción?')) return;
    try {
      await deleteDiscount(id);
      await fetchDiscounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar');
      console.error(err);
    }
  }

  async function handleToggle(id: string, is_active: boolean) {
    try {
      await toggleDiscountStatus(id, !is_active);
      await fetchDiscounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cambiar estado');
      console.error(err);
    }
  }

  function initialFormState(): DiscountFormState {
    return {
      description: '',
      discount_type: 'PERCENTAGE',
      value: '',
      min_purchase: '',
      code: '',
      applies_to_product_ids: [],
      applies_to_category_ids: [],
      starts_at: null,
      ends_at: null,
      days_of_week: [],
      time_of_day_start: null,
      time_of_day_end: null,
      usage_limit_total: null,
      usage_limit_per_customer: null,
      usage_limit_per_day: null,
      is_active: true,
    };
  }

  if (loading) return <p className="text-center py-8">Cargando promociones...</p>;
  if (error) return <p className="text-red-500 text-center py-8">{error}</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Promociones y Descuentos</h1>
        <button
          onClick={() => {
            setEditingId(null);
            setFormData(initialFormState());
          }}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
        >
          {editingId ? 'Cancelar' : 'Nueva Promoción'}
        </button>
      </div>

      {/* Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-gray-700">
          {editingId ? 'Editar promoción' : 'Crear nueva promoción'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descripción
              </label>
              <input
                type="text"
                name="description"
                value={formData.description}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo de descuento
              </label>
              <select
                name="discount_type"
                value={formData.discount_type}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="PERCENTAGE">Porcentaje (%)</option>
                <option value="FIXED_AMOUNT">Monto fijo ($)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valor
              </label>
              <input
                type="number"
                name="value"
                value={formData.value}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                min="0"
                step="0.01"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Compra mínima
              </label>
              <input
                type="number"
                name="min_purchase"
                value={formData.min_purchase}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Código promocional (opcional)
              </label>
              <input
                type="text"
                name="code"
                value={formData.code}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Dejar vacío para promoción automática"
              />
            </div>
            <div className="col-span-2 sm:col-span-1 lg:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Aplicar a productos específicos (opcional)
              </label>
              {/* In a real app, you would have a product selector here.
                 For now, we'll just show a placeholder. */}
              <p className="text-sm text-gray-500">Selector de productos por implementar</p>
            </div>
            <div className="col-span-2 sm:col-span-1 lg:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Aplicar a categorías específicas (opcional)
              </label>
              <p className="text-sm text-gray-500">Selector de categorías por implementar</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha de inicio (opcional)
              </label>
              <input
                type="datetime-local"
                name="starts_at"
                value={formData.starts_at ?? ''}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha de fin (opcional)
              </label>
              <input
                type="datetime-local"
                name="ends_at"
                value={formData.ends_at ?? ''}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="col-span-2 sm:col-span-1 lg:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Días de la semana (opcional)
              </label>
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2, 3, 4, 5, 6].map(day => (
                  <label key={day} className="flex items-center text-sm">
                    <input
                      type="checkbox"
                      checked={formData.days_of_week.includes(day)}
                      onChange={e => handleCheckboxChange(e, 'days_of_week')}
                      value={String(day)}
                      className="form-checkbox h-4 w-4 text-indigo-600"
                    />
                    <span className="ml-1">{['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][day]}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hora de inicio (opcional)
              </label>
              <input
                type="time"
                name="time_of_day_start"
                value={formData.time_of_day_start ?? ''}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hora de fin (opcional)
              </label>
              <input
                type="time"
                name="time_of_day_end"
                value={formData.time_of_day_end ?? ''}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Límite total de usos (opcional)
              </label>
              <input
                type="number"
                name="usage_limit_total"
                value={formData.usage_limit_total ?? ''}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Límite por cliente (opcional)
              </label>
              <input
                type="number"
                name="usage_limit_per_customer"
                value={formData.usage_limit_per_customer ?? ''}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Límite por día (opcional)
              </label>
              <input
                type="number"
                name="usage_limit_per_day"
                value={formData.usage_limit_per_day ?? ''}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                min="0"
              />
            </div>
            <div className="col-span-2 sm:col-span-1 lg:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Estado
              </label>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="is_active"
                  checked={formData.is_active}
                  onChange={handleChange}
                  className="form-checkbox h-4 w-4 text-indigo-600"
                />
                <span className="ml-2 text-sm">Activo</span>
              </div>
            </div>
          </div>

          {isSubmitting ? (
            <p className="text-center text-sm text-gray-500">Guardando...</p>
          ) : (
            <button
              type="submit"
              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingId ? 'Actualizar promoción' : 'Crear promoción'}
            </button>
          )}
        </form>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-gray-700">Lista de promociones</h2>
        {discounts.length === 0 ? (
          <p className="text-center text-gray-500 py-8">No hay promociones creadas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left rtl:text-right">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Descripción</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Tipo</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Valor</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Código</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Activo</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {discounts.map(discount => (
                  <tr key={discount.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">{discount.description}</td>
                    <td className="px-4 py-3">
                      {discount.discount_type === 'PERCENTAGE' ? (
                        <span className="text-indigo-600">%</span>
                      ) : (
                        <span className="text-indigo-600">$</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{discount.value}{discount.discount_type === 'PERCENTAGE' ? '%' : ''}</td>
                    <td className="px-4 py-3">
                      {discount.code ?? <span className="text-gray-400 italic">Automática</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${discount.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {discount.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 space-x-2">
                      <button
                        onClick={() => handleEdit(discount)}
                        className="px-3 py-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleToggle(discount.id, discount.is_active)}
                        className="px-3 py-1 text-sm font-medium text-gray-600 hover:text-gray-800"
                      >
                        {discount.is_active ? 'Pausar' : 'Activar'}
                      </button>
                      <button
                        onClick={() => handleDelete(discount.id)}
                        className="px-3 py-1 text-sm font-medium text-red-600 hover:text-red-800"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}