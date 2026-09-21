// Paso 1 del checkout: formulario de datos del cliente.
// - Usa Zod para validación en cliente (coincide con server action).
// - Guarda en localStorage temporal para recuperar si hay error.
// - Al submit llama a la server action 'createOrder' y muestra resultado.

'use client';

import { useState, useCallback, useEffect } from 'react';
import { useCart } from '@/features/cart/CartContext';
import { createOrder } from '@/features/checkout/actions';
import { z } from 'zod';
import Link from 'next/link';
import { 
  User, 
  Phone, 
  MapPin, 
  FileText, 
  Tag, 
  CheckCircle2, 
  ArrowRight, 
  Loader2, 
  ExternalLink,
  Receipt
} from 'lucide-react';

interface CheckoutFormProps {
  locationId: string; // ID de la location (resuelto por path en el server)
  slug: string; // slug de la location (para volver al menú)
  orderType: 'RECOGER' | 'DOMICILIO';
  paymentMethod: 'EFECTIVO_EXACTO' | 'EFECTIVO_CON_CAMBIO' | 'TARJETA_CONTRA_ENTREGA';
  eta: string; // ISO string from server (local time)
}

const formSchema = z.object({
  customer_name: z.string().min(2, 'Nombre demasiado corto'),
  customer_phone: z
    .string()
    .regex(/^\+?[0-9\s\-\(\)]{10,15}$/, 'Teléfono inválido (mínimo 10 dígitos)'),
  delivery_address: z.string().optional().nullable(),
  delivery_references: z.string().optional().nullable(),
  idempotency_key: z.string().optional(),
  promo_code: z.string().optional().nullable(),
});

const FORM_STORAGE_KEY = 'restaurant-order-jldev:checkout-form';

export function CheckoutForm({
  locationId,
  slug,
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
        setErrors(
          Object.fromEntries(
            Object.entries(fieldErrors).map(([key, value]) => [key, value?.[0] ?? ''])
          )
        );
        setSubmitting(false);
        return;
      }

      // Validación condicional para domicilio
      if (
        orderType === 'DOMICILIO' &&
        (!form.delivery_address || form.delivery_address.trim() === '')
      ) {
        setErrors({
          delivery_address: 'La dirección es obligatoria para pedidos a domicilio',
        });
        setSubmitting(false);
        return;
      }

      // 2. Validar que no haya carrito vacío
      if (cart.items.length === 0) {
        setErrors({ _form: 'El carrito está vacío' });
        setSubmitting(false);
        return;
      }

      // 3. Preparar input para server action (el server revalida location_id contra la DB)
      const idempotencyKey = form.idempotency_key ?? crypto.randomUUID();
      const input = {
        location_id: locationId,
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
          setErrors({ _submit: actionResult.error ?? 'Error al procesar el pedido' });
        }
      } catch (err) {
        console.error(err);
        setErrors({ _submit: 'Error de red o comunicación con el servidor' });
      } finally {
        setSubmitting(false);
      }
    },
    [cart, orderType, paymentMethod, eta, form, locationId]
  );

  // Persistir formulario en localStorage
  useEffect(() => {
    try {
      localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(form));
    } catch {
      // ignore
    }
  }, [form]);

  // Si hay un resultado exitoso, mostramos recibo moderno de confirmación
  if (result?.ok && result.orderId) {
    const displayId = result.orderId.slice(0, 8).toUpperCase();
    return (
      <div className="py-6 text-center animate-in fade-in zoom-in-95 duration-300">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4 ring-8 ring-emerald-50">
          <CheckCircle2 className="w-9 h-9" />
        </div>
        <h2 className="text-2xl font-extrabold text-zinc-900 tracking-tight">
          ¡Pedido Recibido con Éxito!
        </h2>
        <p className="text-sm text-zinc-500 mt-1 max-w-sm mx-auto">
          Ya enviamos tu comanda a cocina. Estamos preparando todo con ingredientes frescos.
        </p>

        {/* Tarjeta de Recibo */}
        <div className="mt-6 max-w-sm mx-auto bg-zinc-50 border border-zinc-200/80 rounded-2xl p-4 text-left shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-200/80">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5" /> Número de Orden
            </span>
            <span className="font-mono font-extrabold text-base text-zinc-900">
              #{displayId}
            </span>
          </div>

          <div className="pt-3 space-y-1.5 text-xs text-zinc-600">
            <div className="flex justify-between">
              <span className="text-zinc-400">Modalidad:</span>
              <span className="font-semibold text-zinc-800">
                {orderType === 'DOMICILIO' ? 'Entrega a Domicilio' : 'Para Recoger en Local'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Pago:</span>
              <span className="font-semibold text-zinc-800">
                {paymentMethod === 'TARJETA_CONTRA_ENTREGA'
                  ? 'Tarjeta al recibir'
                  : paymentMethod === 'EFECTIVO_CON_CAMBIO'
                    ? 'Efectivo con cambio'
                    : 'Efectivo exacto'}
              </span>
            </div>
          </div>
        </div>

        {/* Link de seguimiento del CLIENTE: /track/{uuid} (solo lectura,
            stepper "Seguimiento en Vivo"). El link del repartidor se genera
            aparte desde Caja y se comparte después. */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          {result.trackToken && (
            <Link
              href={`/track/${result.trackToken}`}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-orange-600/25 hover:bg-orange-700 active:scale-95 transition-all"
            >
              <span>Ver seguimiento en vivo</span>
              <ExternalLink className="w-4 h-4" />
            </Link>
          )}

          <Link
            href={`/${slug}`}
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-zinc-100 hover:bg-zinc-200 px-5 py-3 text-sm font-semibold text-zinc-700 active:scale-95 transition-all"
          >
            Volver a la carta
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errors._submit && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs text-red-700 font-medium">
          {errors._submit}
        </div>
      )}

      {errors._form && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs text-red-700 font-medium">
          {errors._form}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Nombre */}
        <div>
          <label htmlFor="customer_name" className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
            Nombre completo *
          </label>
          <div className="relative">
            <User className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="customer_name"
              name="customer_name"
              type="text"
              value={form.customer_name ?? ''}
              onChange={handleChange}
              className={`w-full rounded-xl border bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white text-zinc-900 text-sm pl-10 pr-3.5 py-2.5 transition-all outline-none ${
                errors.customer_name
                  ? 'border-red-500 ring-2 ring-red-500/20'
                  : 'border-zinc-200/80 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20'
              }`}
              placeholder="Ej. Juan Pérez"
              required
            />
          </div>
          {errors.customer_name && (
            <p className="mt-1 text-xs text-red-600 font-medium">{errors.customer_name}</p>
          )}
        </div>

        {/* Teléfono */}
        <div>
          <label htmlFor="customer_phone" className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
            Teléfono de contacto *
          </label>
          <div className="relative">
            <Phone className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="customer_phone"
              name="customer_phone"
              type="tel"
              value={form.customer_phone ?? ''}
              onChange={handleChange}
              className={`w-full rounded-xl border bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white text-zinc-900 text-sm pl-10 pr-3.5 py-2.5 transition-all outline-none ${
                errors.customer_phone
                  ? 'border-red-500 ring-2 ring-red-500/20'
                  : 'border-zinc-200/80 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20'
              }`}
              placeholder="Ej. 55 1234 5678"
              required
            />
          </div>
          {errors.customer_phone && (
            <p className="mt-1 text-xs text-red-600 font-medium">{errors.customer_phone}</p>
          )}
        </div>
      </div>

      {/* Campos para entrega a domicilio */}
      {orderType === 'DOMICILIO' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2">
          <div className="sm:col-span-2">
            <label htmlFor="delivery_address" className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
              Dirección de entrega *
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="delivery_address"
                name="delivery_address"
                type="text"
                value={form.delivery_address ?? ''}
                onChange={handleChange}
                className={`w-full rounded-xl border bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white text-zinc-900 text-sm pl-10 pr-3.5 py-2.5 transition-all outline-none ${
                  errors.delivery_address
                    ? 'border-red-500 ring-2 ring-red-500/20'
                    : 'border-zinc-200/80 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20'
                }`}
                placeholder="Calle, número exterior e interior, colonia"
                required
              />
            </div>
            {errors.delivery_address && (
              <p className="mt-1 text-xs text-red-600 font-medium">
                {errors.delivery_address}
              </p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="delivery_references" className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
              Referencias de entrega (opcional)
            </label>
            <div className="relative">
              <FileText className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="delivery_references"
                name="delivery_references"
                type="text"
                value={form.delivery_references ?? ''}
                onChange={handleChange}
                className="w-full rounded-xl border border-zinc-200/80 bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white text-zinc-900 text-sm pl-10 pr-3.5 py-2.5 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all outline-none"
                placeholder="Entre calles, color de portón, timbre..."
              />
            </div>
          </div>
        </div>
      )}

      {/* Código de cupón / promoción */}
      <div className="pt-2">
        <label htmlFor="promo_code" className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
          Cupón de descuento (opcional)
        </label>
        <div className="relative">
          <Tag className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="promo_code"
            name="promo_code"
            type="text"
            value={form.promo_code ?? ''}
            onChange={handleChange}
            className="w-full rounded-xl border border-zinc-200/80 bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white text-zinc-900 text-sm pl-10 pr-3.5 py-2.5 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all outline-none font-mono uppercase placeholder:normal-case"
            placeholder="Ej. BIENVENIDO10"
          />
        </div>
      </div>

      {/* Botón de envío */}
      <div className="pt-4">
        <button
          type="submit"
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-6 py-3.5 text-sm sm:text-base font-bold text-white shadow-lg shadow-orange-600/25 hover:bg-orange-700 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all select-none"
        >
          {submitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Confirmando y enviando a cocina...</span>
            </>
          ) : (
            <>
              <span>Confirmar y realizar pedido</span>
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}

