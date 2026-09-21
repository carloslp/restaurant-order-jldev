"use client";

import { initializeSystem } from '@/lib/server/setup';
import { validateLocationSlug } from '@/lib/slugs';
import { toUserMessage, toUserFieldErrors } from '@/lib/errors';
import { useState } from 'react';
import Link from 'next/link';
import { 
  Store, 
  Globe, 
  Mail, 
  User, 
  Lock,
  Clock, 
  Percent, 
  Bike, 
  CheckCircle2, 
  ArrowRight, 
  Loader2, 
  SlidersHorizontal,
  ChevronDown,
  MapPin
} from 'lucide-react';

export function SetupForm() {
  const [formData, setFormData] = useState({
    localName: '',
    slug: '',
    address: '',
    adminEmail: '',
    adminName: '',
    adminPassword: '',
    adminPasswordConfirm: '',
    timezone: 'America/Mexico_City',
    iva_rate: 0.16,
    delivery_fee: 0,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChange = (field: keyof typeof formData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Limpiar error al modificar el campo
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.localName.trim()) {
      newErrors.localName = 'El nombre del local es requerido';
    }

    if (!formData.slug.trim()) {
      newErrors.slug = 'La ruta es requerida';
    } else {
      const slugError = validateLocationSlug(formData.slug);
      if (slugError) newErrors.slug = slugError;
    }

    if (!formData.adminEmail.trim()) {
      newErrors.adminEmail = 'El email es requerido';
    } else if (!/\S+@\S+\.\S+/.test(formData.adminEmail)) {
      newErrors.adminEmail = 'Email inválido';
    }

    if (!formData.adminName.trim()) {
      newErrors.adminName = 'El nombre es requerido';
    }

    if (!formData.adminPassword) {
      newErrors.adminPassword = 'La contraseña es requerida';
    } else if (formData.adminPassword.length < 8) {
      newErrors.adminPassword = 'Mínimo 8 caracteres';
    } else if (formData.adminPassword.length > 72) {
      newErrors.adminPassword = 'Máximo 72 caracteres';
    }

    if (!formData.adminPasswordConfirm) {
      newErrors.adminPasswordConfirm = 'Confirma la contraseña';
    } else if (formData.adminPassword !== formData.adminPasswordConfirm) {
      newErrors.adminPasswordConfirm = 'Las contraseñas no coinciden';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    try {
      await initializeSystem(formData as any);
      setSuccess(true);
      setTimeout(() => {
        window.location.href = '/login?setup=complete';
      }, 1500);
    } catch (err: any) {
      // Mensaje traducido; el crudo queda en el log del servidor.
      setErrors({
        ...(toUserFieldErrors(err) ?? {}),
        general: toUserMessage(err, 'No se pudo completar la configuración. Inténtalo de nuevo.'),
      });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="bg-white rounded-3xl border border-zinc-200/80 p-8 shadow-xl shadow-zinc-950/5 text-center animate-in fade-in zoom-in-95 duration-300">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4 ring-8 ring-emerald-50">
          <CheckCircle2 className="w-9 h-9" />
        </div>
        <h3 className="text-2xl font-extrabold text-zinc-900 tracking-tight">
          ¡Configuración Completada!
        </h3>
        <p className="mt-2 text-sm text-zinc-600 leading-relaxed max-w-md mx-auto">
          Tu local <strong>{formData.localName}</strong> está listo y la cuenta de <strong>{formData.adminEmail}</strong> ya está activa con la contraseña que definiste.
        </p>
        <div className="mt-4 p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl text-xs text-zinc-500">
          Redirigiendo automáticamente a la pantalla de acceso...
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-zinc-200/80 p-6 sm:p-8 shadow-xl shadow-zinc-950/5 space-y-5">
      {/* Nombre del Local */}
      <div>
        <label htmlFor="localName" className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
          Nombre de tu Local o Restaurante *
        </label>
        <div className="relative">
          <Store className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="localName"
            type="text"
            value={formData.localName}
            onChange={(e) => handleChange('localName', e.target.value)}
            className={`w-full rounded-xl border bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white text-zinc-900 text-sm pl-10 pr-3.5 py-2.5 transition-all outline-none ${
              errors.localName
                ? 'border-red-500 ring-2 ring-red-500/20'
                : 'border-zinc-200/80 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20'
            }`}
            placeholder="Ej. Taquería El Barrio"
            required
          />
        </div>
        {errors.localName && (
          <p className="mt-1 text-xs text-red-600 font-medium">{errors.localName}</p>
        )}
      </div>

      {/* Ruta / Slug */}
      <div>
        <label htmlFor="slug" className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
          Ruta web de la sucursal (URL) *
        </label>
        <div className="relative flex items-center">
          <Globe className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <span className="absolute left-10 text-xs font-medium text-zinc-400 select-none hidden xs:inline">
            tudominio.com/
          </span>
          <input
            id="slug"
            type="text"
            value={formData.slug}
            onChange={(e) => handleChange('slug', e.target.value.toLowerCase().replace(/\s+/g, '-'))}
            className={`w-full rounded-xl border bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white text-zinc-900 text-sm pl-10 xs:pl-34 pr-3.5 py-2.5 transition-all outline-none font-mono ${
              errors.slug
                ? 'border-red-500 ring-2 ring-red-500/20'
                : 'border-zinc-200/80 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20'
            }`}
            required
            placeholder="centro"
          />
        </div>
        <p className="mt-1.5 text-xs text-zinc-400">
          Tus clientes accederán directamente por esta ruta: <code className="bg-zinc-100 text-zinc-700 px-1 py-0.5 rounded text-[11px]">/{formData.slug || 'sucursal'}</code>
        </p>
        {errors.slug && (
          <p className="mt-1 text-xs text-red-600 font-medium">{errors.slug}</p>
        )}
      </div>

      {/* Dirección física del local */}
      <div>
        <label htmlFor="address" className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
          Dirección física de la sucursal (para cálculo de envíos)
        </label>
        <div className="relative">
          <MapPin className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="address"
            type="text"
            value={formData.address}
            onChange={(e) => handleChange('address', e.target.value)}
            className="w-full rounded-xl border border-zinc-200/80 bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white text-zinc-900 text-sm pl-10 pr-3.5 py-2.5 transition-all outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
            placeholder="Ej. Av. Juárez 70, Centro Histórico, CDMX"
          />
        </div>
        <p className="mt-1.5 text-xs text-zinc-400">
          Se utilizará como punto de origen para calcular las distancias de reparto a domicilio.
        </p>
      </div>

      {/* Email y Nombre Administrador en 2 columnas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-1">
        <div>
          <label htmlFor="adminName" className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
            Nombre del Administrador *
          </label>
          <div className="relative">
            <User className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="adminName"
              type="text"
              value={formData.adminName}
              onChange={(e) => handleChange('adminName', e.target.value)}
              className={`w-full rounded-xl border bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white text-zinc-900 text-sm pl-10 pr-3.5 py-2.5 transition-all outline-none ${
                errors.adminName
                  ? 'border-red-500 ring-2 ring-red-500/20'
                  : 'border-zinc-200/80 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20'
              }`}
              placeholder="Ej. Carlos Martínez"
              required
            />
          </div>
          {errors.adminName && (
            <p className="mt-1 text-xs text-red-600 font-medium">{errors.adminName}</p>
          )}
        </div>

        <div>
          <label htmlFor="adminEmail" className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
            Email del Administrador *
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="adminEmail"
              type="email"
              value={formData.adminEmail}
              onChange={(e) => handleChange('adminEmail', e.target.value)}
              className={`w-full rounded-xl border bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white text-zinc-900 text-sm pl-10 pr-3.5 py-2.5 transition-all outline-none ${
                errors.adminEmail
                  ? 'border-red-500 ring-2 ring-red-500/20'
                  : 'border-zinc-200/80 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20'
              }`}
              placeholder="admin@tulocal.com"
              required
            />
          </div>
          {errors.adminEmail && (
            <p className="mt-1 text-xs text-red-600 font-medium">{errors.adminEmail}</p>
          )}
        </div>
      </div>

      {/* Contraseña del Administrador */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="adminPassword" className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
            Contraseña *
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="adminPassword"
              type="password"
              value={formData.adminPassword}
              onChange={(e) => handleChange('adminPassword', e.target.value)}
              className={`w-full rounded-xl border bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white text-zinc-900 text-sm pl-10 pr-3.5 py-2.5 transition-all outline-none ${
                errors.adminPassword
                  ? 'border-red-500 ring-2 ring-red-500/20'
                  : 'border-zinc-200/80 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20'
              }`}
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              required
            />
          </div>
          {errors.adminPassword && (
            <p className="mt-1 text-xs text-red-600 font-medium">{errors.adminPassword}</p>
          )}
        </div>

        <div>
          <label htmlFor="adminPasswordConfirm" className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
            Confirmar Contraseña *
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="adminPasswordConfirm"
              type="password"
              value={formData.adminPasswordConfirm}
              onChange={(e) => handleChange('adminPasswordConfirm', e.target.value)}
              className={`w-full rounded-xl border bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white text-zinc-900 text-sm pl-10 pr-3.5 py-2.5 transition-all outline-none ${
                errors.adminPasswordConfirm
                  ? 'border-red-500 ring-2 ring-red-500/20'
                  : 'border-zinc-200/80 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20'
              }`}
              placeholder="Repite la contraseña"
              autoComplete="new-password"
              required
            />
          </div>
          {errors.adminPasswordConfirm && (
            <p className="mt-1 text-xs text-red-600 font-medium">{errors.adminPasswordConfirm}</p>
          )}
        </div>
      </div>

      {/* Configuración Avanzada / Operativa */}
      <div className="border-t border-zinc-100 pt-4">
        <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Configuración Operativa (Opcional)</span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Zona horaria */}
          <div>
            <label htmlFor="timezone" className="block text-xs font-medium text-zinc-600 mb-1">
              Zona horaria
            </label>
            <div className="relative">
              <select
                id="timezone"
                value={formData.timezone}
                onChange={(e) => handleChange('timezone', e.target.value)}
                className="w-full rounded-xl border border-zinc-200/80 bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white text-zinc-900 text-xs px-3 py-2.5 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all outline-none appearance-none"
              >
                <option value="America/Mexico_City">México Centro</option>
                <option value="America/Cancun">Quintana Roo</option>
                <option value="America/Merida">Yucatán</option>
                <option value="America/Monterrey">Nuevo León</option>
                <option value="America/Tijuana">Baja California</option>
                <option value="America/Bogota">Colombia</option>
                <option value="America/Lima">Perú</option>
                <option value="America/Santiago">Chile</option>
                <option value="America/Buenos_Aires">Argentina</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Tasa IVA */}
          <div>
            <label htmlFor="iva_rate" className="block text-xs font-medium text-zinc-600 mb-1">
              Tasa IVA
            </label>
            <div className="relative flex items-center">
              <input
                id="iva_rate"
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={formData.iva_rate}
                onChange={(e) => handleChange('iva_rate', parseFloat(e.target.value) || 0)}
                className="w-full rounded-xl border border-zinc-200/80 bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white text-zinc-900 text-xs px-3 py-2.5 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all outline-none"
              />
              <span className="absolute right-3 text-xs font-bold text-zinc-400 pointer-events-none">
                {(formData.iva_rate * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Tarifa Delivery */}
          <div>
            <label htmlFor="delivery_fee" className="block text-xs font-medium text-zinc-600 mb-1">
              Costo de Envío ($)
            </label>
            <input
              id="delivery_fee"
              type="number"
              step="1"
              min="0"
              value={formData.delivery_fee}
              onChange={(e) => handleChange('delivery_fee', parseFloat(e.target.value) || 0)}
              className="w-full rounded-xl border border-zinc-200/80 bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white text-zinc-900 text-xs px-3 py-2.5 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all outline-none"
              placeholder="0"
            />
          </div>
        </div>
      </div>

      {errors.general && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs text-red-700 font-medium">
          {errors.general}
        </div>
      )}

      {/* Acciones del formulario */}
      <div className="pt-3 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
        <Link
          href="/login"
          className="text-xs font-semibold text-zinc-500 hover:text-zinc-800 text-center sm:text-left transition-colors"
        >
          ¿Ya tienes un local? Iniciar sesión
        </Link>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-orange-600/25 hover:bg-orange-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all select-none"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Configurando sistema...</span>
            </>
          ) : (
            <>
              <span>Crear Local y Administrador</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}