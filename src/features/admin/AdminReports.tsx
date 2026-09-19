'use client';

import { useState, useEffect, useCallback } from 'react';
import { getKPIs, exportOrdersCSV, getCashRegisterData, type CashRegisterData } from '@/lib/server/reports';
import type { OrderStatus, OrderType, PaymentMethod } from '@/lib/types';
import { formatMXN } from '@/lib/pricing';
import { FormAlert } from '@/components/ui/form-error';
import { useServerForm } from '@/lib/forms';
import { toUserMessage } from '@/lib/errors';

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
  // Cierre de caja (tarea 22): datos por día con desglose por método de pago.
  const [cashDate, setCashDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [cashData, setCashData] = useState<CashRegisterData | null>(null);
  const [cashLoading, setCashLoading] = useState(false);
  const { formError, setFormError, submit } = useServerForm();
  const cashError = formError;

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const kpiData = await getKPIs(startDate, endDate);
      setKpis(kpiData);
    } catch (err) {
      console.error('loadReports:', err);
      setError(toUserMessage(err, 'No se pudieron cargar los reportes. Inténtalo de nuevo.'));
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  const loadCashRegister = useCallback(async () => {
    setCashLoading(true);
    try {
      const data = await getCashRegisterData(cashDate);
      setCashData(data);
      setFormError(null);
    } catch (err) {
      console.error('loadCashRegister:', err);
      setCashData(null);
      setFormError(toUserMessage(err, 'No se pudo cargar el cierre de caja. Inténtalo de nuevo.'));
    } finally {
      setCashLoading(false);
    }
  }, [cashDate, setFormError]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  useEffect(() => {
    loadCashRegister();
  }, [loadCashRegister]);

  async function handleExportCSV() {
    const ok = await submit(async () => {
      const csv = await exportOrdersCSV(startDate, endDate);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pedidos_${startDate}_${endDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
    if (!ok) setError(cashError ?? 'No se pudo exportar el CSV.');
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

          {/* Revenue by Day — gráfica de barras sin dependencias externas */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold">Ingresos por Día</h3>
            {(() => {
              const maxRevenue = Math.max(1, ...kpis.revenueByDay.map((d) => d.revenue));
              return (
                <div className="space-y-2">
                  {kpis.revenueByDay.map((day) => {
                    const pct = Math.round((day.revenue / maxRevenue) * 100);
                    return (
                      <div key={day.date} className="flex items-center gap-3 text-xs">
                        <span className="w-24 shrink-0 text-gray-600">
                          {new Date(day.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                        </span>
                        <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden" role="img" aria-label={`${day.orders} pedidos, ${formatMXN(day.revenue)}`}>
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded"
                            style={{ width: `${Math.max(pct, day.revenue > 0 ? 2 : 0)}%` }}
                            title={`${day.orders} pedidos · ${formatMXN(day.revenue)}`}
                          />
                        </div>
                        <span className="w-20 shrink-0 text-right text-gray-500">{day.orders} ped.</span>
                        <span className="w-24 shrink-0 text-right font-mono font-semibold">{formatMXN(day.revenue)}</span>
                      </div>
                    );
                  })}
                  {kpis.revenueByDay.length === 0 && (
                    <p className="text-sm text-gray-400 py-4 text-center">Sin ventas en el rango seleccionado.</p>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Cierre de Caja — desglose por método de pago del día seleccionado */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Cierre de Caja</h3>
              <input
                type="date"
                value={cashDate}
                onChange={(e) => setCashDate(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                aria-label="Fecha del cierre de caja"
              />
            </div>
            <FormAlert message={cashError} />
            {cashLoading && !cashData ? (
              <p className="text-sm text-gray-500 py-4">Cargando cierre…</p>
            ) : cashData ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3 mb-4">
                  <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
                    <p className="text-xs font-semibold text-emerald-700 uppercase">Efectivo esperado</p>
                    <p className="text-lg font-mono font-bold text-emerald-800">{formatMXN(cashData.cashExpected)}</p>
                  </div>
                  <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-3">
                    <p className="text-xs font-semibold text-indigo-700 uppercase">Tarjeta esperada</p>
                    <p className="text-lg font-mono font-bold text-indigo-800">{formatMXN(cashData.cardExpected)}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                    <p className="text-xs font-semibold text-gray-700 uppercase">Pedidos del día</p>
                    <p className="text-lg font-mono font-bold text-gray-800">{cashData.orders.length}</p>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-2 font-semibold text-gray-500">Pedido</th>
                      <th className="text-left p-2 font-semibold text-gray-500">Cliente</th>
                      <th className="text-left p-2 font-semibold text-gray-500">Pago</th>
                      <th className="text-right p-2 font-semibold text-gray-500">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {cashData.orders.map((o) => (
                      <tr key={o.id}>
                        <td className="p-2 font-mono">#{o.id.slice(0, 8).toUpperCase()}</td>
                        <td className="p-2">{o.customer_name}</td>
                        <td className="p-2">{PAYMENT_LABELS[o.payment_method]}</td>
                        <td className="p-2 text-right font-mono">{formatMXN(Number(o.total))}</td>
                      </tr>
                    ))}
                    {cashData.orders.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-gray-400">
                          Sin pedidos completados/cancelados ese día.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}