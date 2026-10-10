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
import { 
  LayoutDashboard, 
  UtensilsCrossed, 
  CalendarDays, 
  BadgePercent, 
  BarChart3, 
  Users, 
  Store 
} from 'lucide-react';
import type { Staff, Local } from '@/lib/types';

interface AdminViewProps {
  staff: Staff;
  local: Local | null;
}

type AdminTab = 'dashboard' | 'menu' | 'discounts' | 'reservations' | 'staff' | 'reports' | 'locals';

interface TabItem {
  id: AdminTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  showBadge?: boolean;
}

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

  const tabs: TabItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'menu', label: 'Menú', icon: UtensilsCrossed },
    { id: 'reservations', label: 'Reservas', icon: CalendarDays, showBadge: true },
    { id: 'discounts', label: 'Descuentos', icon: BadgePercent },
    { id: 'reports', label: 'Reportes', icon: BarChart3 },
    { id: 'staff', label: 'Staff', icon: Users },
    { id: 'locals', label: 'Locales', icon: Store },
  ];

  return (
    <div className="space-y-6">
      {/* Cabecera y Submenú Adaptable a Móvil */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
            Panel de administración
          </h1>
          <p className="mt-0.5 text-xs sm:text-sm text-gray-500 font-medium">
            Bienvenido, <span className="font-semibold text-gray-700">{staff.full_name}</span>. Control total del local {local?.name}.
          </p>
        </div>

        {/* Submenú de administración con scroll horizontal suave y táctil */}
        <div className="relative -mx-4 px-4 sm:mx-0 sm:px-0">
          <nav 
            aria-label="Submenú de administración"
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth p-1.5 bg-zinc-100/90 rounded-2xl border border-zinc-200/80 shadow-xs"
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 px-3.5 sm:px-4 min-h-[44px] rounded-xl text-xs sm:text-sm font-bold shrink-0 whitespace-nowrap transition-all select-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 active:scale-95 ${
                    isActive
                      ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200/60'
                      : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-orange-600' : 'text-zinc-500'}`} />
                  <span>{tab.label}</span>
                  {tab.showBadge && pendingReservationsCount > 0 && (
                    <span 
                      aria-label={`${pendingReservationsCount} reservas pendientes`}
                      className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-black bg-amber-500 text-white shadow-xs animate-pulse"
                    >
                      {pendingReservationsCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
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
