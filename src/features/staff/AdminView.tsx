// src/features/staff/AdminView.tsx
'use client';

import { useState } from 'react';
import type { StaffRole } from '@/lib/types';
import { AdminMenuCategories } from '@/features/admin/AdminMenuCategories';

interface AdminViewProps {
  staff: {
    email: string;
    full_name: string;
    role: StaffRole;
    location_id: string;
  };
  local: {
    name: string;
    subdomain: string;
    timezone: string;
    iva_rate: number;
    delivery_fee: number;
  } | null;
}

type AdminTab = 'dashboard' | 'menu';

export function AdminView({ staff, local }: AdminViewProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Panel de administración</h1>
          <p className="mt-1 text-sm text-gray-500">
            Bienvenido, {staff.full_name}. Control total del local {local?.name}.
          </p>
        </div>
        <nav className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'dashboard' 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('menu')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'menu' 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Menú
          </button>
        </nav>
      </div>

      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold text-gray-500 uppercase">
                Local
              </h2>
              {local ? (
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Nombre</dt>
                    <dd className="font-medium">{local.name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Subdominio</dt>
                    <dd className="font-medium">{local.subdomain}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Zona horaria</dt>
                    <dd className="font-medium">{local.timezone}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">IVA</dt>
                    <dd className="font-medium">{(local.iva_rate * 100).toFixed(0)}%</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Costo de envío</dt>
                    <dd className="font-medium">${Number(local.delivery_fee).toFixed(2)}</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-gray-400">No hay datos del local.</p>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold text-gray-500 uppercase">
                Tu perfil
              </h2>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Email</dt>
                  <dd className="font-medium">{staff.email}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Rol</dt>
                  <dd className="font-medium">{staff.role}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6">
            <h2 className="mb-2 text-lg font-semibold text-gray-700">
              Próximamente
            </h2>
            <ul className="list-inside list-disc space-y-1 text-sm text-gray-600">
              <li>Panel de promociones y descuentos (engine completo)</li>
              <li>Reservas y gestión de zonas/aforo</li>
              <li>Reportes y cierre de caja</li>
              <li>Gestión de staff (altas, roles, desactivación)</li>
            </ul>
          </div>
        </div>
      )}

      {activeTab === 'menu' && (
        <div className="space-y-6">
          <AdminMenuCategories />
          {/* Aquí se añadirán AdminMenuProducts y AdminModifierGroups más adelante */}
        </div>
      )}
    </div>
  );
}
