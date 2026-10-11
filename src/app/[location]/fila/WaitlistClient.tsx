'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Users, 
  Clock, 
  MapPin, 
  ArrowLeft, 
  ChevronRight, 
  User, 
  Phone, 
  Sparkles, 
  Building2, 
  Trees, 
  Coffee, 
  CheckCircle2,
  AlertCircle,
  HelpCircle
} from 'lucide-react';
import type { WaitlistZonePreference } from '@/lib/types';
import { joinPublicWaitlist } from '@/lib/server/waitlist';
import { FormAlert, FieldError, fieldAria } from '@/components/ui/form-error';

interface Props {
  local: {
    id: string;
    name: string;
    slug: string;
    is_open: boolean;
  };
}

export default function WaitlistClient({ local }: Props) {
  const router = useRouter();

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [partySize, setPartySize] = useState<number>(2);
  const [preferredZone, setPreferredZone] = useState<WaitlistZonePreference>('CUALQUIERA');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const zones: Array<{ id: WaitlistZonePreference; label: string; icon: any; hint: string }> = [
    { id: 'CUALQUIERA', label: 'Cualquiera disponible', icon: Sparkles, hint: 'Menor tiempo de espera' },
    { id: 'INTERIOR', label: 'Salón Interior', icon: Building2, hint: 'Climatizado' },
    { id: 'TERRAZA', label: 'Terraza / Jardín', icon: Trees, hint: 'Al aire libre' },
    { id: 'BARRA', label: 'Barra', icon: Coffee, hint: 'Asientos altos' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    if (!customerName.trim()) {
      setFieldErrors((prev) => ({ ...prev, customer_name: 'Por favor ingresa tu nombre' }));
      return;
    }
    const cleanPhone = customerPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setFieldErrors((prev) => ({ ...prev, customer_phone: 'Ingresa un teléfono válido a 10 dígitos' }));
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await joinPublicWaitlist({
        location_slug: local.slug,
        customer_name: customerName,
        customer_phone: customerPhone,
        party_size: partySize,
        preferred_zone: preferredZone,
        notes: notes || null,
      });

      if (res.ok && res.trackingToken) {
        router.push(`/track/fila/${res.trackingToken}`);
      } else {
        setFormError(res.error || 'No fue posible registrarte en la fila.');
      }
    } catch {
      setFormError('Error de conexión. Intenta nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white selection:bg-orange-600 selection:text-white">
      {/* Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            href={`/${local.slug}`}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver al menú</span>
          </Link>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-400 bg-orange-950/60 border border-orange-800/40 px-2.5 py-1 rounded-full">
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            <span>Fila Virtual Activa</span>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6 sm:py-10 space-y-6">
        {/* Banner Hero */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-orange-600/10 border border-orange-500/30 rounded-2xl flex items-center justify-center mx-auto text-orange-500 shadow-md">
            <Users className="w-6 h-6" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Fila de Espera en Puerta
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-sm mx-auto">
            {local.name}. Fórmate en línea, revisa tu lugar en vivo y recibe un aviso cuando tu mesa esté lista.
          </p>
        </div>

        {/* Formulario */}
        <form
          onSubmit={handleSubmit}
          className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 sm:p-7 shadow-xl space-y-6"
        >
          <FormAlert message={formError} />

          {/* Comensales */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
              ¿Cuántas personas son?
            </label>
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setPartySize(num)}
                  className={`min-h-[48px] rounded-xl font-black text-sm transition-all select-none cursor-pointer active:scale-95 ${
                    partySize === num
                      ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30 ring-2 ring-orange-500'
                      : 'bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700/80 border border-zinc-700/50'
                  }`}
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  const input = prompt('Ingresa número de comensales (máximo 30):', String(partySize));
                  if (input) {
                    const parsed = parseInt(input, 10);
                    if (!isNaN(parsed) && parsed > 0 && parsed <= 30) setPartySize(parsed);
                  }
                }}
                className={`col-span-2 min-h-[48px] rounded-xl font-bold text-xs transition-all select-none cursor-pointer active:scale-95 ${
                  partySize > 8
                    ? 'bg-orange-600 text-white ring-2 ring-orange-500'
                    : 'bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700/80 border border-zinc-700/50'
                }`}
              >
                {partySize > 8 ? `${partySize} personas` : 'Más de 8…'}
              </button>
            </div>
          </div>

          {/* Preferencia de Zona */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
              Preferencia de Ubicación
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {zones.map((z) => {
                const Icon = z.icon;
                const isSelected = preferredZone === z.id;
                return (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => setPreferredZone(z.id)}
                    className={`p-3.5 rounded-2xl border text-left flex items-start gap-3 transition-all cursor-pointer active:scale-95 min-h-[56px] ${
                      isSelected
                        ? 'bg-orange-950/40 border-orange-500 ring-1 ring-orange-500/50 text-white'
                        : 'bg-zinc-800/50 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'
                    }`}
                  >
                    <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${isSelected ? 'text-orange-500' : 'text-zinc-500'}`} />
                    <div className="flex-1">
                      <div className="text-xs sm:text-sm font-bold text-zinc-200">{z.label}</div>
                      <div className="text-[11px] text-zinc-500">{z.hint}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Datos de Contacto */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                Nombre de contacto *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  placeholder="Ej. Juan Pérez"
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    if (fieldErrors.customer_name) setFieldErrors({ ...fieldErrors, customer_name: '' });
                  }}
                  className="w-full pl-10 pr-4 py-3 min-h-[48px] rounded-xl bg-zinc-950/90 border border-zinc-800 text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  required
                />
              </div>
              <FieldError id="cust-name-err" message={fieldErrors.customer_name} />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                WhatsApp / Teléfono Móvil *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                  <Phone className="w-4 h-4" />
                </div>
                <input
                  type="tel"
                  placeholder="Ej. 667 123 4567"
                  value={customerPhone}
                  onChange={(e) => {
                    setCustomerPhone(e.target.value);
                    if (fieldErrors.customer_phone) setFieldErrors({ ...fieldErrors, customer_phone: '' });
                  }}
                  className="w-full pl-10 pr-4 py-3 min-h-[48px] rounded-xl bg-zinc-950/90 border border-zinc-800 text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  required
                />
              </div>
              <FieldError id="cust-phone-err" message={fieldErrors.customer_phone} />
              <p className="text-[11px] text-zinc-500 mt-1">
                Te notificaremos cuando tu mesa esté lista para que entres a sentarte.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                Notas adicionales (opcional)
              </label>
              <input
                type="text"
                placeholder="Ej. Silla para bebé, festejo de cumpleaños…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-950/90 border border-zinc-800 text-white placeholder-zinc-500 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Botón de Acción Principal */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 min-h-[52px] rounded-2xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-extrabold text-sm sm:text-base tracking-wide shadow-lg shadow-orange-600/30 transition-all select-none cursor-pointer flex items-center justify-center gap-2 active:scale-98"
          >
            {isSubmitting ? (
              <span>Registrando tu turno…</span>
            ) : (
              <>
                <span>Unirme a la Fila de Espera</span>
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Card Informativa de Citas y Reservas */}
        <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-4 text-center space-y-1">
          <p className="text-xs text-zinc-400 font-medium">
            ¿Deseas planear tu visita para otro día u otra hora?
          </p>
          <Link
            href={`/${local.slug}/reservar`}
            className="inline-block text-xs font-bold text-orange-400 hover:text-orange-300 underline"
          >
            Agendar una Reservación Programada
          </Link>
        </div>
      </main>
    </div>
  );
}
