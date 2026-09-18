'use client';

import { useState, useEffect } from 'react';
import { getKPIs, exportOrdersCSV } from '@/lib/server/reports';
import type { OrderStatus, OrderType, PaymentMethod } from '@/lib/types';
import { formatMXN } from '@/lib/pricing';

interface KPIData {
  totalOrders: number;
  totalRevenue: number;
  averageTicket: number;
  ordersByStatus: Record<OrderStatus, number>;
  ordersByType: Record<OrderType, number>;
  ordersByPaymentMethod: Record<PaymentMethod, number>;
  revenueByDay: Array<{ date: string; revenue: number; orders: number }>;
  topProducts: Array<{ product_name: string; quantity: number; revenue: number }>;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  CREADO: 'Creado',
  CONFIRMADO_CAJA: 'Confirmado',
  EN_PREPARACION: 'En preparación',
  LISTO: 'Listo',
  LISTO_PARA_ENTREGA: 'Listo para entrega',
  COMPLETADO: 'Completado',
  CANCELADO: 'Cancelado',
};

const TYPE_LABELS: Record<OrderType, string> = {
  RECOGER: 'Para llevar',
  DOMICILIO: 'Domicilio',
};

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  EFECTIVO_EXACTO: 'Efectivo (exacto)',
  EFECTIVO_CON_CAMBIO: 'Efectivo (con cambio)',
  TARJETA_CONTRA_ENTREGA: 'Tarjeta',
};

export function AdminReports() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [kpis, setKpis] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReports();
  }, [startDate, endDate]);

  async function loadReports() {
    setLoading(true);
    setError(null);
    try {
      const kpiData = await getKPIs(startDate, endDate);
      setKpis(kpiData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar reportes');
    } finally {
      setLoading(false);
    }
  }

  async function handleExportCSV() {
    try {
      const csv = await exportOrdersCSV(startDate, endDate);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pedidos_${startDate}_${endDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al exportar CSV');
    }
  }

  if (loading && !kpis) {
    return <div className="flex justify-center py-8">Cargando reportes...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Reportes y Estadísticas</h2>
        <button onClick={handleExportCSV} className="btn-secondary">
          📥 Exportar CSV
        </button>
      </div>

      {/* Date Range Selector */}
      <div className="flex gap-4 items-center">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {kpis && (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-500 uppercase">Total Pedidos</h3>
              <p className="mt-2 text-3xl font-bold text-gray-900">{kpis.totalOrders}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-500 uppercase">Ingresos Totales</h3>
              <p className="mt-2 text-3xl font-bold text-gray-900">{formatMXN(kpis.totalRevenue)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-500 uppercase">Ticket Promedio</h3>
              <p className="mt-2 text-3xl font-bold text-gray-900">{formatMXN(kpis.averageTicket)}</p>
            </div>
          </div>

          {/* Orders by Status */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold">Pedidos por Estado</h3>
            <div className="space-y-2">
              {Object.entries(kpis.ordersByStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{STATUS_LABELS[status as OrderStatus]}</span>
                  <span className="font-mono font-semibold">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Orders by Type */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold">Por Tipo de Orden</h3>
              <div className="space-y-2">
                {Object.entries(kpis.ordersByType).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{TYPE_LABELS[type as OrderType]}</span>
                    <span className="font-mono font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold">Por Método de Pago</h3>
              <div className="space-y-2">
                {Object.entries(kpis.ordersByPaymentMethod).map(([method, count]) => (
                  <div key={method} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{PAYMENT_LABELS[method as PaymentMethod]}</span>
                    <span className="font-mono font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top Products */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold">Productos Más Vendidos</h3>
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-2 text-sm font-semibold text-gray-500">Producto</th>
                  <th className="text-right p-2 text-sm font-semibold text-gray-500">Cantidad</th>
                  <th className="text-right p-2 text-sm font-semibold text-gray-500">Ingresos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {kpis.topProducts.slice(0, 10).map((product, idx) => (
                  <tr key={idx}>
                    <td className="p-2 text-sm">{product.product_name}</td>
                    <td className="p-2 text-sm text-right font-mono">{product.quantity}</td>
                    <td className="p-2 text-sm text-right font-mono">{formatMXN(product.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Revenue by Day */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold">Ingresos por Día</h3>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {kpis.revenueByDay.map((day) => (
                <div key={day.date} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{new Date(day.date).toLocaleDateString('es-MX')}</span>
                  <div className="flex gap-4">
                    <span className="text-gray-500">{day.orders} pedidos</span>
                    <span className="font-mono font-semibold">{formatMXN(day.revenue)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}