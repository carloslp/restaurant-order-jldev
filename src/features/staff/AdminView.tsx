'use client';

import { useState, useEffect } from 'react';
import { AdminMenuCategories } from '@/features/admin/AdminMenuCategories';
import { AdminMenuProducts } from '@/features/admin/AdminMenuProducts';
import { AdminDiscounts } from '@/features/admin/AdminDiscounts';
import { AdminReservations } from '@/features/admin/AdminReservations';
import { AdminStaff } from '@/features/admin/AdminStaff';
import { AdminReports } from '@/features/admin/AdminReports';
import { AdminLocals } from '@/features/admin/AdminLocals';
import { getPendingReservationsCount } from '@/lib/server/reservations';
import type { Staff, Local } from '@/lib/types';

interface AdminViewProps {
  staff: Staff;
  local: Local | null;
}

type AdminTab = 'dashboard' | 'menu' | 'discounts' | 'reservations' | 'staff' | 'reports' | 'locals';

export function AdminView({ staff, local }: AdminViewProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [pendingReservationsCount, setPendingReservationsCount] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    getPendingReservationsCount()
      .then((count) => {
        if (mounted) setPendingReservationsCount(count);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [activeTab]);

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
                  <button
                    onClick={() => setActiveTab('reservations')}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                      activeTab === 'reservations'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <span>Reservas</span>
                    {pendingReservationsCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-xs bg-amber-500 text-white font-extrabold animate-pulse">
                        {pendingReservationsCount}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab('discounts')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                      activeTab === 'discounts'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Descuentos
                  </button>
                  <button
                    onClick={() => setActiveTab('reports')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                      activeTab === 'reports'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Reportes
                  </button>
                  <button
                    onClick={() => setActiveTab('staff')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                      activeTab === 'staff'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Staff
                  </button>
                  <button
                    onClick={() => setActiveTab('locals')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                      activeTab === 'locals'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Locales
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
                          <dt className="text-gray-500">Ruta</dt>
                          <dd className="font-medium">/{local.slug}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-gray-500">Zona horaria</dt>
                          <dd className="font-medium">{local.timezone}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-gray-500">IVA</dt>
                          <dd className="font-medium">{local.iva_rate * 100}%</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-gray-500">Costo de envío</dt>
                          <dd className="font-medium">${local.delivery_fee.toFixed(2)}</dd>
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
                    </dl>
                  </div>
                </div>

                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6">
                                  <h2 className="mb-2 text-lg font-semibold text-gray-700">
                                    Próximamente
                                  </h2>
                                  <ul className="list-inside list-disc space-y-1 text-sm text-gray-600">
                                    <li>Reportes y cierre de caja</li>
                                  </ul>
                                </div>
              </div>
            )}

            {activeTab === 'menu' && (
              <div className="space-y-6">
                <AdminMenuCategories local={local} />
                <hr className="my-8 border-gray-200" />
                <AdminMenuProducts local={local} />
                {/* Los modificadores se gestionan dentro de la vista de productos o en un modal dedicado */}
              </div>
            )}

            {activeTab === 'reservations' && (
              <AdminReservations localSlug={local?.slug} />
            )}

            {activeTab === 'discounts' && <AdminDiscounts />}

                        {activeTab === 'staff' && <AdminStaff />}

                        {activeTab === 'reports' && <AdminReports />}

            {activeTab === 'locals' && <AdminLocals />}
    </div>
  );
}
