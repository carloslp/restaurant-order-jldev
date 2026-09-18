// Paso 1 del checkout: formulario de datos del cliente.
// - Usa Zod para validación en cliente (coincide con server action).
// - Guarda en localStorage temporal para recuperar si hay error.
// - Al submit llama a la server action 'createOrder' y muestra resultado.

'use client';

import { useState, useCallback, useEffect } from 'react';
import type { Cart, CartItem } from '@/lib/types';
import { useCart } from '@/features/cart/CartContext';
import { formatMXN } from '@/lib/pricing';
import { createOrder } from '@/features/checkout/actions';
import { z } from 'zod';
import Link from 'next/link';

interface CheckoutFormProps {
  orderType: 'RECOGER' | 'DOMICILIO';
  paymentMethod: 'EFECTIVO_EXACTO' | 'EFECTIVO_CON_CAMBIO' | 'TARJETA_CONTRA_ENTREGA';
  eta: string; // ISO string from server (local time)
}

const formSchema = z.object({
  customer_name: z.string().min(2, 'Nombre demasiado corto'),
  customer_phone: z
    .string()
    .regex(/^\+?[0-9\s\-\(\)]{10,15}$/, 'Teléfono inválido'),
  delivery_address: z.string().optional().nullable(),
  delivery_references: z.string().optional().nullable(),
  idempotency_key: z.string().optional(),
  promo_code: z.string().optional().nullable(),
});

const FORM_STORAGE_KEY = 'restaurant-order-jldev:checkout-form';

export function CheckoutForm({
  orderType,
  paymentMethod,
  eta,
}: CheckoutFormProps) {
  const { cart } = useCart();
  const [form, setForm] = useState<Record<string, string | null | undefined>>(() => {
    try {
      const raw = localStorage.getItem(FORM_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, string | null | undefined>) : {};
    } catch {
      return {};
    }
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    error?: string;
    orderId?: string;
    trackToken?: string;
  } | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = e.target;
      setForm((prev) => ({
        ...prev,
        [name]: value,
      }));
      // limpiar error del campo al tocarlo
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    },
    []
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitting(true);
      setResult(null);

      // 1. Validar cliente
      const parseResult = formSchema.safeParse(form);
      if (!parseResult.success) {
        const fieldErrors = parseResult.error.flatten().fieldErrors;
        setErrors(Object.fromEntries(
          Object.entries(fieldErrors).map(([key, value]) => [key, value?.[0] ?? ''])
        ));
        setSubmitting(false);
        return;
      }

      // Validación condicional para domicilio
      if (orderType === 'DOMICILIO' && (!form.delivery_address || form.delivery_address.trim() === '')) {
        setErrors({ delivery_address: 'La dirección es obligatoria para pedidos a domicilio' });
        setSubmitting(false);
        return;
      }

      // 2. Validar que no haya carrito vacío
      if (cart.items.length === 0) {
        setErrors({ _form: 'Carrito vacío' });
        setSubmitting(false);
        return;
      }

      // 3. Preparar input para server action (location_id será derivado del host en la acción)
      const idempotencyKey =
        form.idempotency_key ?? crypto.randomUUID();
      const input = {
        customer_name: form.customer_name!.trim(),
        customer_phone: form.customer_phone!.trim(),
        order_type: orderType,
        payment_method: paymentMethod,
        delivery_address:
          orderType === 'DOMICILIO'
            ? (form.delivery_address ?? '').trim() || null
            : null,
        delivery_references:
          orderType === 'DOMICILIO'
            ? (form.delivery_references ?? '').trim() || null
            : null,
        eta,
        cart,
        idempotency_key: idempotencyKey,
        promo_code: form.promo_code?.trim() || null,
      };

      // 4. Llamada a la server action
      try {
        const actionResult = await createOrder(input);
        if (actionResult.ok && actionResult.order) {
          setResult({
            ok: true,
            orderId: actionResult.order.id,
            trackToken: actionResult.track_token ?? undefined,
          });
          // limpiar formulario guardado tras éxito
          localStorage.removeItem(FORM_STORAGE_KEY);
        } else {
          setErrors({ _submit: actionResult.error ?? 'Error desconocido' });
        }
      } catch (err) {
        console.error(err);
        setErrors({ _submit: 'Error de red o servidor' });
      } finally {
        setSubmitting(false);
      }
    },
    [cart, orderType, paymentMethod, eta, form]
  );

  // Persistir formulario (excepto password si tuviéramos)
  useEffect(() => {
    try {
      localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(form));
    } catch {
      // ignore quota exceeded
    }
  }, [form]);

  // Si hay un resultado exitoso, mostramos mensaje de confirmación en lugar del formulario
  if (result?.ok && result.orderId) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="mb-4 text-2xl font-bold text-green-600">
            ¡Pedido confirmado!
          </h2>
          <p className="mb-4">
            Su pedido <strong>#{result.orderId.slice(0, 8).toUpperCase()}</strong> ha sido recibido y está en proceso.
          </p>
          {result.trackToken && (
            <>
              <p className="mb-2">
                Puede seguir el estado de su pedido en:
              </p>
              <p className="mb-4 font-mono bg-gray-100 px-3 py-2 rounded">
                /track/{result.trackToken}
              </p>
              <Link href={`/track/${result.trackToken}`} className="inline-block rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 transition">
                Ver seguimiento
              </Link>
            </>
          )}
          <Link href="/" className="text-sm text-orange-600 hover:underline">
            Volver al menú
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="customer_name" className="block text-sm font-medium mb-1">
            Nombre completo
          </label>
          <input
            id="customer_name"
            name="customer_name"
            type="text"
            value={form.customer_name ?? ''}
            onChange={handleChange}
            className={`block w-full rounded-md border-gray-300 px-3 py-2 ${
              errors.customer_name ? 'border-red-500' : ''
            }`}
            placeholder="Juan Pérez"
            required
          />
          {errors.customer_name && (
            <p className="mt-1 text-sm text-red-600">{errors.customer_name}</p>
          )}
        </div>

        <div>
          <label htmlFor="customer_phone" className="block text-sm font-medium mb-1">
            Teléfono (con LADA)
          </label>
          <input
            id="customer_phone"
            name="customer_phone"
            type="tel"
            value={form.customer_phone ?? ''}
            onChange={handleChange}
            className={`block w-full rounded-md border-gray-300 px-3 py-2 ${
              errors.customer_phone ? 'border-red-500' : ''
            }`}
            placeholder="+52 55 1234 5678"
            required
          />
          {errors.customer_phone && (
            <p className="mt-1 text-sm text-red-600">{errors.customer_phone}</p>
          )}
        </div>
      </div>

      {orderType === 'DOMICILIO' && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="delivery_address" className="block text-sm font-medium mb-1">
              Dirección de entrega
            </label>
            <input
              id="delivery_address"
              name="delivery_address"
              type="text"
              value={form.delivery_address ?? ''}
              onChange={handleChange}
              className={`block w-full rounded-md border-gray-300 px-3 py-2 ${
                errors.delivery_address ? 'border-red-500' : ''
              }`}
              placeholder="Calle Ejemplo #123, Col. Centro"
            />
            {errors.delivery_address && (
              <p className="mt-1 text-sm text-sm text-red-600">
                {errors.delivery_address}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="delivery_references" className="block text-sm font-medium mb-1">
              Referencias (opcional)
            </label>
            <input
              id="delivery_references"
              name="delivery_references"
              type="text"
              value={form.delivery_references ?? ''}
              onChange={handleChange}
              className="block w-full rounded-md border-gray-300 px-3 py-2"
              placeholder="Entre calles, color de casa, etc."
            />
          </div>
        </div>
      )}

      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <label htmlFor="promo_code" className="block text-sm font-medium mb-1">
          Código Promocional (opcional)
        </label>
        <div className="flex gap-2">
          <input
            id="promo_code"
            name="promo_code"
            type="text"
            value={form.promo_code ?? ''}
            onChange={handleChange}
            className="block w-full rounded-md border-gray-300 px-3 py-2"
            placeholder="Ej: VERANO2024"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className={`disabled:opacity-50 disabled:cursor-not-allowed rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 transition`}
        >
          {submitting ? 'Procesando...' : 'Confirmar pedido'}
        </button>
      </div>
    </form>
  );
}
