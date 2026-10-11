// Paso 1 y 2 del checkout: formulario progresivo de datos del cliente.
// Feature F-UI-01: Rediseño Progresivo del Checkout Móvil
// - 2 Pasos lógicos: 1: Datos de entrega y método; 2: Resumen y confirmación.
// - CA-1: Validación inline al perder foco (onBlur) con border-red-500, aria-invalid="true" y mensaje contextual.
// - CA-2: Selector táctil de método de entrega con tarjetas tipo botón (mínimo 52px de altura), iconos claros y check.
// - CA-3: Prevención de pérdida de datos por recarga usando sessionStorage (nombre, teléfono, notas).
// - CA-1 (F-02): Bloqueo de doble clic (pointer-events-none + spinner + "Procesando pedido...").
// - CA-2 (F-02): Alerta accesible de timeout/fallo de OSM con opción de reintentar.

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
  ArrowLeft,
  Loader2, 
  ExternalLink,
  Receipt,
  Navigation,
  AlertTriangle,
  AlertCircle,
  MessageSquare,
  Bike,
  Store,
  Check,
  Edit2,
  ShoppingBag,
} from 'lucide-react';
import { estimateDeliveryFee } from '@/features/checkout/estimateDelivery';
import { type DeliveryFeeResult } from '@/lib/pricing/deliveryMatrix';
import { formatMXN } from '@/lib/pricing';
import {
  validateCheckoutField,
  validateStepOne,
  getSafePersistableData,
  CHECKOUT_SESSION_STORAGE_KEY,
} from '@/features/checkout/checkoutValidation';

interface CheckoutFormProps {
  locationId: string; // ID de la location (resuelto por path en el server)
  slug: string; // slug de la location (para volver al menú)
  orderType: 'RECOGER' | 'DOMICILIO' | 'EN_MESA';
  tableId?: string | null;
  tableNumber?: string | null;
  sessionId?: string | null;
  paymentMethod: 'EFECTIVO_EXACTO' | 'EFECTIVO_CON_CAMBIO' | 'TARJETA_CONTRA_ENTREGA';
  eta: string; // ISO string from server (local time)
  onSuccess?: (orderId: string, trackToken?: string) => void;
  onDeliveryEstimationChange?: (fee: number, zoneName: string | null, isDeliverable: boolean) => void;
  onOrderTypeChange?: (type: 'RECOGER' | 'DOMICILIO') => void;
}

const standardFormSchema = z.object({
  customer_name: z.string().min(2, 'El nombre debe tener al menos 2 letras'),
  customer_phone: z
    .string()
    .regex(/^\+?[0-9\s\-\(\)]{10,15}$/, 'Teléfono inválido (mínimo 10 dígitos)'),
  delivery_address: z.string().optional().nullable(),
  delivery_references: z.string().optional().nullable(),
  notes: z.string().max(500, 'Notas demasiado largas').optional().nullable(),
  idempotency_key: z.string().optional(),
  promo_code: z.string().optional().nullable(),
});

const mesaFormSchema = z.object({
  customer_name: z.string().max(100, 'Nombre demasiado largo').optional().nullable(),
  notes: z.string().max(500, 'Notas demasiado largas').optional().nullable(),
  idempotency_key: z.string().optional(),
});

export function CheckoutForm({
  locationId,
  slug,
  orderType,
  tableId,
  tableNumber,
  sessionId,
  paymentMethod,
  eta,
  onSuccess,
  onDeliveryEstimationChange,
  onOrderTypeChange,
}: CheckoutFormProps) {
  const { cart, clearCart, total } = useCart();

  // CA-3: Recuperación de campos no confidenciales desde sessionStorage
  const [form, setForm] = useState<Record<string, string | null | undefined>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw =
        sessionStorage.getItem(CHECKOUT_SESSION_STORAGE_KEY) ||
        localStorage.getItem(CHECKOUT_SESSION_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, string | null | undefined>) : {};
    } catch {
      return {};
    }
  });

  // Estado del flujo de 2 pasos progresivos
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [estimation, setEstimation] = useState<DeliveryFeeResult | null>(null);
  const [estimationError, setEstimationError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    ok: boolean;
    error?: string;
    orderId?: string;
    trackToken?: string;
  } | null>(null);

  // CA-3: Persistencia automática en sessionStorage de campos no confidenciales
  useEffect(() => {
    try {
      const safeData = getSafePersistableData(form);
      sessionStorage.setItem(CHECKOUT_SESSION_STORAGE_KEY, JSON.stringify(safeData));
    } catch {
      // ignore
    }
  }, [form]);

  const runEstimation = useCallback(
    async (addr?: string, testKey?: string) => {
      if (orderType !== 'DOMICILIO') return;
      const targetAddress = addr ?? (form.delivery_address as string | undefined);
      if (!targetAddress?.trim() && !testKey) {
        setEstimation(null);
        setEstimationError(null);
        return;
      }

      setEstimating(true);
      setEstimationError(null);
      try {
        const res = await estimateDeliveryFee({
          locationId,
          address: targetAddress,
          testScenarioKey: testKey,
        });

        if (res.ok && res.data) {
          setEstimation(res.data);
          if (res.calculationFailed || res.data.failedToCalculate) {
            setEstimationError(
              'No pudimos calcular la distancia exacta. El costo de envío se confirmará al contactarte'
            );
            onDeliveryEstimationChange?.(res.data.fee, 'Por confirmar al contactarte', true);
          } else {
            setEstimationError(null);
            onDeliveryEstimationChange?.(res.data.fee, res.data.zoneName, res.data.isDeliverable);
          }
        } else {
          setEstimation(null);
          setEstimationError(
            'No pudimos calcular la distancia exacta. El costo de envío se confirmará al contactarte'
          );
          onDeliveryEstimationChange?.(0, 'Por confirmar al contactarte', true);
        }
      } catch (err) {
        console.error('Error estimando tarifa de envío:', err);
        setEstimation(null);
        setEstimationError(
          'No pudimos calcular la distancia exacta. El costo de envío se confirmará al contactarte'
        );
        onDeliveryEstimationChange?.(0, 'Por confirmar al contactarte', true);
      } finally {
        setEstimating(false);
      }
    },
    [locationId, orderType, form.delivery_address, onDeliveryEstimationChange]
  );

  // Debounce para estimar al teclear dirección
  useEffect(() => {
    if (orderType !== 'DOMICILIO' || !form.delivery_address || form.delivery_address.trim().length < 5) {
      return;
    }
    const timer = setTimeout(() => {
      runEstimation(form.delivery_address as string);
    }, 700);
    return () => clearTimeout(timer);
  }, [form.delivery_address, orderType, runEstimation]);

  // CA-1: Validación inline en tiempo real al escribir si ya tenía error
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = e.target;
      setForm((prev) => ({
        ...prev,
        [name]: value,
      }));

      if (errors[name]) {
        const errorMsg = validateCheckoutField(name, value, { orderType });
        setErrors((prev) => {
          const next = { ...prev };
          if (errorMsg) next[name] = errorMsg;
          else delete next[name];
          return next;
        });
      }
    },
    [errors, orderType]
  );

  // CA-1: Validación inline al perder foco (onBlur)
  const handleBlur = useCallback(
    (name: string) => {
      const errorMsg = validateCheckoutField(name, form[name], { orderType });
      setErrors((prev) => {
        const next = { ...prev };
        if (errorMsg) {
          next[name] = errorMsg;
        } else {
          delete next[name];
        }
        return next;
      });
    },
    [form, orderType]
  );

  // Avance del Paso 1 al Paso 2 (Resumen y confirmación)
  const handleProceedToStep2 = () => {
    const stepErrors = validateStepOne(form, { orderType });
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      // Enfoca el primer campo que tenga error
      const firstInvalidField = Object.keys(stepErrors)[0];
      const el = document.getElementById(firstInvalidField);
      el?.focus();
      return;
    }

    if (orderType === 'DOMICILIO' && estimation && !estimation.isDeliverable) {
      setErrors({
        delivery_address: estimation.reason || 'La dirección está fuera de nuestra zona de cobertura.',
      });
      return;
    }

    setErrors({});
    setCurrentStep(2);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      // CA-1 (F-02): Bloqueo de doble submit / protección contra dobles envíos
      if (submitting) return;

      // Si por alguna razón está en paso 1 y se presiona submit, validar y avanzar a paso 2
      if (currentStep === 1 && orderType !== 'EN_MESA') {
        handleProceedToStep2();
        return;
      }

      setSubmitting(true);
      setResult(null);

      // 1. Validar cliente
      const schemaToUse = orderType === 'EN_MESA' ? mesaFormSchema : standardFormSchema;
      const parseResult = schemaToUse.safeParse(form);
      if (!parseResult.success) {
        const fieldErrors = parseResult.error.flatten().fieldErrors;
        setErrors(
          Object.fromEntries(
            Object.entries(fieldErrors).map(([key, value]) => [key, value?.[0] ?? ''])
          )
        );
        setCurrentStep(1);
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
        setCurrentStep(1);
        setSubmitting(false);
        return;
      }

      if (orderType === 'DOMICILIO' && estimation && !estimation.isDeliverable) {
        setErrors({
          delivery_address: estimation.reason || 'La dirección está fuera de nuestra zona de cobertura.',
        });
        setCurrentStep(1);
        setSubmitting(false);
        return;
      }

      // 2. Validar que no haya carrito vacío
      if (cart.items.length === 0) {
        setErrors({ _form: 'El carrito está vacío' });
        setSubmitting(false);
        return;
      }

      // 3. Preparar input para server action
      const idempotencyKey = form.idempotency_key ?? crypto.randomUUID();
      const input = {
        location_id: locationId,
        customer_name: orderType === 'EN_MESA' && tableNumber
          ? (form.customer_name?.trim() ? `Mesa ${tableNumber} · ${form.customer_name.trim()}` : `Mesa ${tableNumber}`)
          : (form.customer_name ?? '').trim(),
        customer_phone: (form.customer_phone ?? '').trim() || '0000000000',
        order_type: orderType,
        table_id: tableId || null,
        table_number: tableNumber || null,
        session_id: sessionId || null,
        payment_method: paymentMethod,
        delivery_address:
          orderType === 'DOMICILIO'
            ? (form.delivery_address ?? '').trim() || null
            : null,
        delivery_references:
          orderType === 'DOMICILIO'
            ? (form.delivery_references ?? '').trim() || null
            : null,
        notes: (form.notes ?? '').trim() || null,
        eta,
        cart,
        idempotency_key: idempotencyKey,
        promo_code: orderType === 'EN_MESA' ? null : (form.promo_code?.trim() || null),
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
          // CA-3: Limpiar carrito y sessionStorage tras éxito
          clearCart();
          try {
            sessionStorage.removeItem(CHECKOUT_SESSION_STORAGE_KEY);
            localStorage.removeItem(CHECKOUT_SESSION_STORAGE_KEY);
          } catch {
            // ignore
          }
          if (onSuccess) {
            onSuccess(actionResult.order.id, actionResult.track_token ?? undefined);
          }
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
    [cart, clearCart, orderType, paymentMethod, eta, form, locationId, onSuccess, currentStep, tableNumber, tableId, sessionId, estimation]
  );

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
      {/* Mensajes de error globales */}
      {errors._submit && (
        <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs text-red-700 font-medium">
          {errors._submit}
        </div>
      )}

      {errors._form && (
        <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs text-red-700 font-medium">
          {errors._form}
        </div>
      )}

      {orderType === 'EN_MESA' ? (
        /* Flujo simplificado EN_MESA */
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-orange-50/70 border border-orange-200/80 text-xs text-orange-950 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-600 text-white flex items-center justify-center font-black text-base shrink-0 shadow-xs">
              🍽️
            </div>
            <div>
              <p className="font-extrabold text-sm text-orange-900">
                Comanda en {tableNumber || 'Mesa'}
              </p>
              <p className="text-orange-800/80 mt-0.5 leading-relaxed">
                Tus platillos se enviarán directamente a la cocina para su preparación. La cuenta permanecerá abierta.
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="customer_name" className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Nombre o alias (opcional)</span>
              <span className="text-[11px] text-zinc-400 font-normal normal-case">Para identificar quién ordena en la mesa</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="customer_name"
                name="customer_name"
                type="text"
                value={form.customer_name ?? ''}
                onChange={handleChange}
                onBlur={() => handleBlur('customer_name')}
                className="w-full min-h-[48px] rounded-xl border border-zinc-200/80 bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white text-zinc-900 text-sm pl-10 pr-3.5 py-2.5 transition-all outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                placeholder={tableNumber ? `Ej. Carlos (o déjalo en blanco para Mesa ${tableNumber})` : 'Ej. Carlos'}
              />
            </div>
          </div>

          <div>
            <label htmlFor="notes" className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-orange-600" />
              <span>Comentarios o notas para cocina (opcional)</span>
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              value={form.notes ?? ''}
              onChange={handleChange}
              className="w-full rounded-xl border border-zinc-200/80 bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white text-zinc-900 text-sm p-3 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all outline-none resize-none"
              placeholder="Ej. Sin cebolla, término medio, traer salsas picantes extra..."
              maxLength={500}
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className={`w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-6 py-3.5 text-sm sm:text-base font-bold text-white shadow-lg shadow-orange-600/25 hover:bg-orange-700 active:scale-[0.99] transition-all select-none ${
                submitting ? 'pointer-events-none opacity-70 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Procesando pedido...</span>
                </>
              ) : (
                <>
                  <span>Confirmar Pedido (Mesa)</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* Flujo Progresivo de 2 Pasos para DOMICILIO y RECOGER */
        <div className="space-y-5">
          {/* Indicador visual de los 2 pasos progresivos */}
          <div className="bg-zinc-50/80 border border-zinc-200/70 rounded-2xl p-3 sm:p-3.5 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Paso {currentStep} de 2
              </span>
              <span className="text-xs font-bold text-orange-600">
                {currentStep === 1 ? '1. Datos de entrega y método' : '2. Resumen y confirmación'}
              </span>
            </div>
            <div className="w-full bg-zinc-200 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full bg-orange-600 transition-all duration-300 ${
                  currentStep === 1 ? 'w-1/2' : 'w-full'
                }`}
              />
            </div>
          </div>

          {/* ======================================================== */}
          {/* PASO 1: Datos de entrega y método                        */}
          {/* ======================================================== */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* CA-2: Selector táctil de método de entrega (tarjetas tipo botón ≥ 52px con icono y check) */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-2">
                  Método de entrega *
                </label>
                <div role="radiogroup" aria-label="Método de entrega" className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={orderType === 'DOMICILIO'}
                    onClick={() => onOrderTypeChange?.('DOMICILIO')}
                    className={`min-h-[52px] min-w-[44px] p-3.5 rounded-2xl border text-left transition-all select-none active:scale-[0.98] flex items-center justify-between cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
                      orderType === 'DOMICILIO'
                        ? 'border-orange-600 bg-orange-50/70 ring-2 ring-orange-600/30 text-zinc-900 shadow-2xs'
                        : 'border-zinc-200 hover:border-zinc-300 bg-white text-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          orderType === 'DOMICILIO' ? 'bg-orange-600 text-white' : 'bg-zinc-100 text-zinc-600'
                        }`}
                      >
                        <Bike className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs sm:text-sm font-extrabold block truncate">A domicilio</span>
                        <span className="text-[11px] text-zinc-500 block truncate">Entrega rápida en tu puerta</span>
                      </div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ml-2 transition-colors ${
                        orderType === 'DOMICILIO' ? 'bg-orange-600 text-white' : 'border-2 border-zinc-300 bg-white'
                      }`}
                    >
                      {orderType === 'DOMICILIO' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={orderType === 'RECOGER'}
                    onClick={() => onOrderTypeChange?.('RECOGER')}
                    className={`min-h-[52px] min-w-[44px] p-3.5 rounded-2xl border text-left transition-all select-none active:scale-[0.98] flex items-center justify-between cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
                      orderType === 'RECOGER'
                        ? 'border-orange-600 bg-orange-50/70 ring-2 ring-orange-600/30 text-zinc-900 shadow-2xs'
                        : 'border-zinc-200 hover:border-zinc-300 bg-white text-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          orderType === 'RECOGER' ? 'bg-orange-600 text-white' : 'bg-zinc-100 text-zinc-600'
                        }`}
                      >
                        <Store className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs sm:text-sm font-extrabold block truncate">Para recoger en sucursal</span>
                        <span className="text-[11px] text-zinc-500 block truncate">Pasa por tu orden al local</span>
                      </div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ml-2 transition-colors ${
                        orderType === 'RECOGER' ? 'bg-orange-600 text-white' : 'border-2 border-zinc-300 bg-white'
                      }`}
                    >
                      {orderType === 'RECOGER' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </button>
                </div>
              </div>

              {/* Datos de contacto con CA-1 (onBlur, aria-invalid, border-red-500 y mensaje contextual) */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-1">
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
                      onBlur={() => handleBlur('customer_name')}
                      aria-invalid={Boolean(errors.customer_name)}
                      aria-describedby={errors.customer_name ? 'error-customer_name' : undefined}
                      className={`w-full min-h-[48px] rounded-xl border bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white text-zinc-900 text-sm pl-10 pr-3.5 py-2.5 transition-all outline-none ${
                        errors.customer_name
                          ? 'border-red-500 ring-2 ring-red-500/20 bg-red-50/10'
                          : 'border-zinc-200/80 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20'
                      }`}
                      placeholder="Ej. Juan Pérez"
                      required
                    />
                  </div>
                  {errors.customer_name && (
                    <p
                      id="error-customer_name"
                      role="alert"
                      className="mt-1.5 text-xs text-red-600 font-semibold flex items-center gap-1 animate-in fade-in duration-150"
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errors.customer_name}</span>
                    </p>
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
                      onBlur={() => handleBlur('customer_phone')}
                      aria-invalid={Boolean(errors.customer_phone)}
                      aria-describedby={errors.customer_phone ? 'error-customer_phone' : undefined}
                      className={`w-full min-h-[48px] rounded-xl border bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white text-zinc-900 text-sm pl-10 pr-3.5 py-2.5 transition-all outline-none ${
                        errors.customer_phone
                          ? 'border-red-500 ring-2 ring-red-500/20 bg-red-50/10'
                          : 'border-zinc-200/80 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20'
                      }`}
                      placeholder="Ej. 55 1234 5678"
                      required
                    />
                  </div>
                  {errors.customer_phone && (
                    <p
                      id="error-customer_phone"
                      role="alert"
                      className="mt-1.5 text-xs text-red-600 font-semibold flex items-center gap-1 animate-in fade-in duration-150"
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errors.customer_phone}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Campos específicos para entrega a domicilio */}
              {orderType === 'DOMICILIO' && (
                <div className="space-y-4 pt-1">
                  <div>
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
                        onBlur={() => handleBlur('delivery_address')}
                        aria-invalid={Boolean(errors.delivery_address)}
                        aria-describedby={errors.delivery_address ? 'error-delivery_address' : undefined}
                        className={`w-full min-h-[48px] rounded-xl border bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white text-zinc-900 text-sm pl-10 pr-3.5 py-2.5 transition-all outline-none ${
                          errors.delivery_address
                            ? 'border-red-500 ring-2 ring-red-500/20 bg-red-50/10'
                            : 'border-zinc-200/80 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20'
                        }`}
                        placeholder="Calle, número exterior e interior, colonia"
                        required
                      />
                    </div>
                    {errors.delivery_address && (
                      <p
                        id="error-delivery_address"
                        role="alert"
                        className="mt-1.5 text-xs text-red-600 font-semibold flex items-center gap-1 animate-in fade-in duration-150"
                      >
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{errors.delivery_address}</span>
                      </p>
                    )}

                    {/* Estimación de distancia en vivo (F-02) */}
                    {estimating && (
                      <div
                        role="status"
                        aria-live="polite"
                        className="mt-2.5 flex items-center gap-2 p-3 rounded-xl bg-orange-50/90 border border-orange-200/80 text-xs text-orange-900 animate-pulse font-medium"
                      >
                        <Loader2 className="w-4 h-4 animate-spin text-orange-600 shrink-0" />
                        <span>Calculando costo de entrega y distancia...</span>
                      </div>
                    )}

                    {!estimating && estimationError && (
                      <div
                        role="alert"
                        aria-live="polite"
                        className="mt-2.5 p-3.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-200 shadow-2xs"
                      >
                        <div className="flex items-start sm:items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5 sm:mt-0" />
                          <span className="font-semibold text-amber-900">
                            {estimationError}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => runEstimation(form.delivery_address as string)}
                          disabled={estimating || submitting}
                          className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 text-xs font-bold transition-all shadow-2xs self-end sm:self-auto shrink-0 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          Reintentar
                        </button>
                      </div>
                    )}

                    {!estimating && !estimationError && estimation && (
                      <div
                        className={`mt-2.5 p-3 rounded-xl border text-xs transition-all ${
                          estimation.isDeliverable
                            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                            : 'bg-red-50 border-red-200 text-red-800'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {estimation.isDeliverable ? (
                            <Navigation className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                          )}
                          <div className="space-y-0.5">
                            <div className="font-bold flex items-center gap-2">
                              <span>{estimation.zoneName}</span>
                              {estimation.isDeliverable && (
                                <span className="font-extrabold text-emerald-700 bg-emerald-100/70 px-1.5 py-0.5 rounded">
                                  {formatMXN(estimation.fee)}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] opacity-90">
                              {estimation.isDeliverable ? (
                                <span>
                                  Distancia estimada: <strong>{estimation.distanceKm} km</strong>
                                  {estimation.durationMinutes ? ` · Tiempo de viaje: ~${Math.round(estimation.durationMinutes)} min` : ''}
                                </span>
                              ) : (
                                <span>{estimation.reason}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
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
                        className="w-full min-h-[48px] rounded-xl border border-zinc-200/80 bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white text-zinc-900 text-sm pl-10 pr-3.5 py-2.5 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all outline-none"
                        placeholder="Entre calles, color de portón, timbre..."
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Cupón y notas de preparación */}
              <div className="space-y-4 pt-1">
                <div>
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
                      className="w-full min-h-[48px] rounded-xl border border-zinc-200/80 bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white text-zinc-900 text-sm pl-10 pr-3.5 py-2.5 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all outline-none font-mono uppercase placeholder:normal-case"
                      placeholder="Ej. BIENVENIDO10"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="notes" className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-orange-600" />
                    <span>Notas o comentarios del pedido (opcional)</span>
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    rows={2}
                    value={form.notes ?? ''}
                    onChange={handleChange}
                    onBlur={() => handleBlur('notes')}
                    className="w-full rounded-xl border border-zinc-200/80 bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white text-zinc-900 text-sm p-3 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all outline-none resize-none"
                    placeholder="Ej. Sin cebolla, alérgico a nueces, salsa aparte..."
                    maxLength={500}
                  />
                  {errors.notes && (
                    <p role="alert" className="mt-1 text-xs text-red-600 font-medium">
                      {errors.notes}
                    </p>
                  )}
                </div>
              </div>

              {/* Botón para avanzar a Paso 2 (Resumen y confirmación) */}
              <div className="pt-3">
                <button
                  type="button"
                  onClick={handleProceedToStep2}
                  className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-6 py-3.5 text-sm sm:text-base font-bold text-white shadow-lg shadow-orange-600/25 hover:bg-orange-700 active:scale-[0.99] transition-all cursor-pointer"
                >
                  <span>Continuar al resumen (Paso 2)</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* PASO 2: Resumen y confirmación                          */}
          {/* ======================================================== */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Tarjeta de Resumen de Entrega y Contacto */}
              <div className="p-4 sm:p-5 rounded-2xl bg-zinc-50 border border-zinc-200/90 space-y-3">
                <div className="flex items-center justify-between pb-2.5 border-b border-zinc-200">
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-600 flex items-center gap-1.5">
                    {orderType === 'DOMICILIO' ? <Bike className="w-4 h-4 text-orange-600" /> : <Store className="w-4 h-4 text-orange-600" />}
                    <span>{orderType === 'DOMICILIO' ? 'Entrega a domicilio' : 'Para recoger en sucursal'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 hover:underline cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Modificar</span>
                  </button>
                </div>

                <div className="space-y-2 text-xs sm:text-sm text-zinc-700">
                  <div className="flex justify-between">
                    <span className="text-zinc-500 font-medium">Cliente:</span>
                    <span className="font-bold text-zinc-900">{form.customer_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500 font-medium">Teléfono:</span>
                    <span className="font-bold text-zinc-900">{form.customer_phone}</span>
                  </div>
                  {orderType === 'DOMICILIO' && (
                    <div className="flex justify-between items-start gap-4">
                      <span className="text-zinc-500 font-medium shrink-0">Dirección:</span>
                      <span className="font-bold text-zinc-900 text-right">{form.delivery_address}</span>
                    </div>
                  )}
                  {orderType === 'DOMICILIO' && form.delivery_references && (
                    <div className="flex justify-between items-start gap-4">
                      <span className="text-zinc-500 font-medium shrink-0">Referencias:</span>
                      <span className="font-medium text-zinc-700 text-right">{form.delivery_references}</span>
                    </div>
                  )}
                  {form.notes && (
                    <div className="flex justify-between items-start gap-4 pt-1 border-t border-zinc-200/60">
                      <span className="text-zinc-500 font-medium shrink-0">Notas:</span>
                      <span className="font-medium text-zinc-700 text-right">{form.notes}</span>
                    </div>
                  )}
                  {form.promo_code && (
                    <div className="flex justify-between items-center pt-1 border-t border-zinc-200/60">
                      <span className="text-zinc-500 font-medium">Cupón:</span>
                      <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {form.promo_code.toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Botón de envío final con CA-1 de F-02 (bloqueo doble clic, spinner, Procesando pedido...) */}
              <div className="pt-2 space-y-2">
                <button
                  type="submit"
                  disabled={submitting}
                  aria-busy={submitting}
                  className={`w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-6 py-3.5 text-sm sm:text-base font-bold text-white shadow-lg shadow-orange-600/25 hover:bg-orange-700 active:scale-[0.99] transition-all select-none ${
                    submitting ? 'pointer-events-none opacity-70 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Procesando pedido...</span>
                    </>
                  ) : (
                    <>
                      <span>Confirmar Pedido</span>
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  disabled={submitting}
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-xs sm:text-sm font-bold text-zinc-700 active:scale-[0.99] transition-all cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Volver al paso 1</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
