// src/features/staff/AdminView.tsx
'use client';

import type { StaffRole } from '@/lib/types';

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

export function AdminView({ staff, local }: AdminViewProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Panel de administración</h1>
        <p className="mt-1 text-sm text-gray-500">
          Bienvenido, {staff.full_name}. Este es el centro de control del local.
        </p>
      </div>

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
          <li>Gestión de menú (categorías, productos, modificadores)</li>
          <li>Panel de promociones y descuentos (engine completo)</li>
          <li>Reservas y gestión de zonas/aforo</li>
          <li>Reportes y cierre de caja</li>
          <li>Gestión de staff (altas, roles, desactivación)</li>
        </ul>
      </div>
    </div>
  );
}