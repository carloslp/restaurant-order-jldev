import { initializeSystem, checkSystemInitialized } from '@/lib/server/setup';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { useState } from 'react';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  // Verificar si el sistema ya está inicializado
  const isInitialized = await checkSystemInitialized();

  if (isInitialized) {
    // Redirigir a login si ya hay locales
    return redirect('/staff/login');
  }

  // Mostrar el formulario de setup
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
            Configuración Inicial
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Configura tu primer local y usuario administrador
          </p>
        </div>
        <SetupForm />
      </div>
    </div>
  );
}

// Componente del formulario
function SetupForm() {
  const [formData, setFormData] = useState({
    localName: '',
    subdomain: '',
    adminEmail: '',
    adminName: '',
    timezone: 'America/Mexico_City',
    iva_rate: 0.16,
    delivery_fee: 0,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChange = (field: keyof typeof formData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Limpiar error al modificar el campo
    if (errors[field]) {
      setErrors(prev => {
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

    if (!formData.subdomain.trim()) {
      newErrors.subdomain = 'El subdominio es requerido';
    } else if (!/^[a-z0-9-]+$/.test(formData.subdomain)) {
      newErrors.subdomain = 'Solo letras minúsculas, números y guiones';
    } else if (formData.subdomain.length < 3) {
      newErrors.subdomain = 'Mínimo 3 caracteres';
    } else if (formData.subdomain.length > 63) {
      newErrors.subdomain = 'Máximo 63 caracteres';
    }

    if (!formData.adminEmail.trim()) {
      newErrors.adminEmail = 'El email es requerido';
    } else if (!/\S+@\S+\.\S+/.test(formData.adminEmail)) {
      newErrors.adminEmail = 'Email inválido';
    }

    if (!formData.adminName.trim()) {
      newErrors.adminName = 'El nombre es requerido';
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
      // Pequeña pausa para mostrar el mensaje de éxito
      setTimeout(() => {
        // Redirigir a la página de login para que el usuario use su magic link
        window.location.href = '/staff/login?setup=complete';
      }, 1500);
    } catch (err: any) {
      setErrors({ general: err.message || 'Error desconocido' });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center">
        <div className="flex items-center justify-center h-12">
          <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="mt-4 text-lg font-medium text-gray-900">
          Configuración completada
        </h3>
        <p className="mt-2 text-sm text-gray-600">
          Se ha enviado un magic link a <strong>{formData.adminEmail}</strong>.
          Revisa tu email para completar la configuración y acceder al panel.
        </p>
        <p className="mt-4 text-xs text-gray-500">
          Si no ves el email, revisa tu carpeta de spam.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="localName" className="block text-sm font-medium text-gray-700 mb-1">
          Nombre del Local *
        </label>
        <input
          id="localName"
          type="text"
          value={formData.localName}
          onChange={(e) => handleChange('localName', e.target.value)}
          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          required
        />
        {errors.localName && (
          <p className="mt-1 text-sm text-red-600">{errors.localName}</p>
        )}
      </div>

      <div>
        <label htmlFor="subdomain" className="block text-sm font-medium text-gray-700 mb-1">
          Subdominio (URL) *
        </label>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-500">https://</span>
          <input
            id="subdomain"
            type="text"
            value={formData.subdomain}
            onChange={(e) => handleChange('subdomain', e.target.value.toLowerCase())}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            required
            placeholder="mi-restaurante"
          />
          <span className="text-sm text-gray-500">.tuapp.com</span>
        </div>
        {errors.subdomain && (
          <p className="mt-1 text-sm text-red-600">{errors.subdomain}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="adminEmail" className="block text-sm font-medium text-gray-700 mb-1">
            Email Administrador *
          </label>
          <input
            id="adminEmail"
            type="email"
            value={formData.adminEmail}
            onChange={(e) => handleChange('adminEmail', e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            required
          />
          {errors.adminEmail && (
            <p className="mt-1 text-sm text-red-600">{errors.adminEmail}</p>
          )}
        </div>

        <div>
          <label htmlFor="adminName" className="block text-sm font-medium text-gray-700 mb-1">
            Nombre Administrador *
          </label>
          <input
            id="adminName"
            type="text"
            value={formData.adminName}
            onChange={(e) => handleChange('adminName', e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            required
          />
          {errors.adminName && (
            <p className="mt-1 text-sm text-red-600">{errors.adminName}</p>
          )}
        </div>
      </div>

      <div className="border-t pt-4">
        <div className="text-sm font-medium text-gray-500 mb-2">
          Configuración avanzada (opcional)
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-1">
              Zona horaria
            </label>
            <select
              id="timezone"
              value={formData.timezone}
              onChange={(e) => handleChange('timezone', e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              <option value="America/Mexico_City">México Centro</option>
              <option value="America/Cancun">Quintana Roo</option>
              <option value="America/Merida">Yucatán</option>
              <option value="America/Monterrey">Nuevo León</option>
              <option value="America/Tijuana">Baja California</option>
              <option value="America/Bogotá">Colombia</option>
              <option value="America/Lima">Perú</option>
              <option value="America/Santiago">Chile</option>
              <option value="America/Buenos_Aires">Argentina</option>
            </select>
          </div>

          <div>
            <label htmlFor="iva_rate" className="block text-sm font-medium text-gray-700 mb-1">
              Tasa IVA
            </label>
            <div className="flex items-center">
              <input
                id="iva_rate"
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={formData.iva_rate}
                onChange={(e) => handleChange('iva_rate', parseFloat(e.target.value) || 0)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              />
              <span className="ml-2 text-xs text-gray-500">
                {formData.iva_rate * 100}%
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="delivery_fee" className="block text-sm font-medium text-gray-700 mb-1">
              Tarifa Delivery ($)
            </label>
            <input
              id="delivery_fee"
              type="number"
              step="0.01"
              min="0"
              value={formData.delivery_fee}
              onChange={(e) => handleChange('delivery_fee', parseFloat(e.target.value) || 0)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => window.location.href = '/staff/login'}
          className="text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          Ya tienes un local? Iniciar sesión
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          {loading ? 'Configurando...' : 'Crear Local y Administrador'}
        </button>
      </div>
    </form>
  );
}