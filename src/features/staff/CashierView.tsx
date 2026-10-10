// src/features/staff/CashierView.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { updateOrderStatus, assignDriver, regenerateDeliveryToken } from '@/lib/server/order';
import { applyManualDiscount } from '@/lib/server/discounts';
import { listStaff } from '@/lib/server/staff';
import { getStaffTables, chargeAndCloseTableAccount } from '@/lib/server/tables';
import { useRealtimeOrders } from '@/features/staff/useRealtimeOrders';
import { toUserMessage } from '@/lib/errors';
import type { Order, RestaurantTable, PaymentMethod } from '@/lib/types';
import { formatMXN } from '@/lib/pricing';
import { Ban, UtensilsCrossed } from 'lucide-react';
import { ProductAvailabilityManager } from '@/features/staff/ProductAvailabilityManager';

interface CashierViewProps {
  locationId: string;
}

interface StaffOption {
  id: string;
  full_name: string;
}

interface TableAccountGroup {
  tableKey: string;
  tableId: string | null;
  tableNumber: string;
  zone: string | null;
  orders: Order[];
  total: number;
  subtotal: number;
  iva: number;
  firstOrderAt: string;
  hasInKitchen: boolean;
  hasReady: boolean;
  allServed: boolean;
}

function orderTypeLabel(type: Order['order_type']): string {
  if (type === 'DOMICILIO') return '🚀 Delivery';
  if (type === 'EN_MESA') return '🍽️ En Mesa';
  return '🏃 Para llevar';
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

const ACTIVE_STATUSES: Order['status'][] = [
  'CREADO',
  'CONFIRMADO_CAJA',
  'EN_PREPARACION',
  'LISTO',
  'LISTO_PARA_ENTREGA',
];

export function CashierView({ locationId }: CashierViewProps) {
  const [activeTab, setActiveTab] = useState<'mesas' | 'delivery'>('mesas');

  // Pedidos en tiempo real (incluye órdenes en mesa con cobro pendiente aunque ya estén completadas en cocina)
  const orders = useRealtimeOrders({
    locationId,
    statuses: ACTIVE_STATUSES,
    limit: 150,
    includePendingTableOrders: true,
  });

  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [drivers, setDrivers] = useState<StaffOption[]>([]);
  const [deliveryLinks, setDeliveryLinks] = useState<Record<string, string>>({});
  const [driverSelectFor, setDriverSelectFor] = useState<string | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [discountingOrderId, setDiscountingOrderId] = useState<string | null>(null);
  const [manualAmount, setManualAmount] = useState('');

  // Estados de cobro de mesa
  const [chargingTableId, setChargingTableId] = useState<string | null>(null);
  const [tablePaymentMethods, setTablePaymentMethods] = useState<Record<string, PaymentMethod>>({});
  const [preCuentaTable, setPreCuentaTable] = useState<TableAccountGroup | null>(null);
  const [isAvailabilityOpen, setIsAvailabilityOpen] = useState(false);

  useEffect(() => {
    if (!copiedOrderId) return;
    const t = setTimeout(() => setCopiedOrderId(null), 3000);
    return () => clearTimeout(t);
  }, [copiedOrderId]);

  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 4000);
    return () => clearTimeout(t);
  }, [successMsg]);

  // Cargar mesas del restaurante
  const loadTables = useCallback(async () => {
    try {
      const data = await getStaffTables();
      setTables(data);
    } catch (err) {
      console.error('loadTables error:', err);
    }
  }, []);

  // Cargar personal para asignación de repartidores
  const loadDrivers = useCallback(async () => {
    try {
      const staff = await listStaff();
      setDrivers(staff.filter((s) => s.is_active).map((s) => ({ id: s.id, full_name: s.full_name })));
    } catch (err) {
      console.error('loadDrivers:', err);
    }
  }, []);

  useEffect(() => {
    loadTables();
    loadDrivers();
  }, [loadTables, loadDrivers]);

  async function handleAction(orderId: string, nextStatus: Order['status']) {
    setError(null);
    // Mutación optimista inmediata en caja (0 ms)
    const rollback = orders.mutateOrderStatusOptimistic?.(orderId, nextStatus);

    try {
      const result = await updateOrderStatus(orderId, nextStatus);
      if (!result.ok) {
        rollback?.();
        setError(result.error ?? 'No se pudo actualizar la orden');
      }
    } catch {
      rollback?.();
      setError('Error de comunicación al actualizar la comanda');
    }
  }

  async function handleApplyManualDiscount(orderId: string) {
    const amount = parseFloat(manualAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Ingrese un monto válido mayor a 0');
      return;
    }

    setError(null);
    try {
      await applyManualDiscount(orderId, amount, 'Descuento manual en caja');
      setDiscountingOrderId(null);
      setManualAmount('');
    } catch (err) {
      setError(toUserMessage(err, 'No se pudo aplicar el descuento. Inténtalo de nuevo.'));
    }
  }

  async function handleAssignDriver(orderId: string, driverId: string) {
    setError(null);
    const result = await assignDriver(orderId, driverId || null);
    if (!result.ok) {
      setError(result.error ?? 'No se pudo asignar el repartidor.');
      return;
    }
    setDriverSelectFor(null);
  }

  async function handleGetDeliveryLink(orderId: string) {
    setError(null);
    if (deliveryLinks[orderId]) {
      copyToClipboard(deliveryLinks[orderId]);
      setCopiedOrderId(orderId);
      return;
    }

    const result = await regenerateDeliveryToken(orderId);
    if (!result.ok || !result.url) {
      setError(result.error ?? 'No se pudo generar el link.');
      return;
    }
    setDeliveryLinks((prev) => ({ ...prev, [orderId]: result.url as string }));
    copyToClipboard(result.url as string);
    setCopiedOrderId(orderId);
  }

  function copyToClipboard(text: string) {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  }

  // Cobro consolidado de una cuenta de mesa
  async function handleChargeTable(group: TableAccountGroup) {
    if (!group.tableId) {
      setError('Esta mesa no tiene un identificador registrado para cerrar.');
      return;
    }

    const method = tablePaymentMethods[group.tableKey] || 'EFECTIVO_EXACTO';
    const methodLabel =
      method === 'TARJETA_CONTRA_ENTREGA'
        ? 'Tarjeta / Terminal'
        : method === 'EFECTIVO_CON_CAMBIO'
          ? 'Efectivo con cambio'
          : 'Efectivo exacto';

    if (
      !confirm(
        `¿Cobrar cuenta completa de Mesa ${group.tableNumber} por un total de ${formatMXN(group.total)} (${methodLabel}) y liberar la mesa?`
      )
    ) {
      return;
    }

    setChargingTableId(group.tableKey);
    setError(null);
    try {
      const res = await chargeAndCloseTableAccount(group.tableId, method);
      if (res.ok) {
        setSuccessMsg(`¡Cuenta de Mesa ${group.tableNumber} cobrada con éxito! Mesa liberada.`);
        await loadTables();
      }
    } catch (err) {
      setError(toUserMessage(err, 'Error al cobrar la cuenta de la mesa'));
    } finally {
      setChargingTableId(null);
    }
  }

  // --- AGRUPACIÓN DE COMANDAS POR MESA ---
  const tablesMap = new Map(tables.map((t) => [t.id, t]));
  const groupsMap = new Map<string, TableAccountGroup>();

  const tableOrders = orders.filter(
    (o) => o.order_type === 'EN_MESA' && o.payment_status === 'PENDIENTE' && o.status !== 'CANCELADO'
  );

  for (const order of tableOrders) {
    const table = order.table_id ? tablesMap.get(order.table_id) : undefined;

    let tableNumber = table?.table_number || order.table_number || '';
    if (!tableNumber && order.customer_name) {
      const match = order.customer_name.match(/Mesa\s+([A-Za-z0-9_-]+)/i);
      if (match) tableNumber = match[1];
    }
    if (!tableNumber) tableNumber = 'Salón';

    const groupKey = order.table_id || `table_num_${tableNumber}`;

    if (!groupsMap.has(groupKey)) {
      groupsMap.set(groupKey, {
        tableKey: groupKey,
        tableId: order.table_id || null,
        tableNumber,
        zone: table?.zone || null,
        orders: [],
        total: 0,
        subtotal: 0,
        iva: 0,
        firstOrderAt: order.created_at,
        hasInKitchen: false,
        hasReady: false,
        allServed: true,
      });
    }

    const g = groupsMap.get(groupKey)!;
    g.orders.push(order);
    g.total += Number(order.total);
    g.subtotal += Number(order.subtotal);
    g.iva += Number(order.iva_amount);

    if (new Date(order.created_at).getTime() < new Date(g.firstOrderAt).getTime()) {
      g.firstOrderAt = order.created_at;
    }
    if (['CREADO', 'CONFIRMADO_CAJA', 'EN_PREPARACION'].includes(order.status)) {
      g.hasInKitchen = true;
      g.allServed = false;
    }
    if (order.status === 'LISTO') {
      g.hasReady = true;
      g.allServed = false;
    }
  }

  // Ordenar comandas de cada mesa por orden cronológico (Ronda 1, Ronda 2...)
  for (const g of groupsMap.values()) {
    g.orders.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  const tableGroups = Array.from(groupsMap.values()).sort((a, b) => {
    const numA = parseInt(a.tableNumber, 10);
    const numB = parseInt(b.tableNumber, 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.tableNumber.localeCompare(b.tableNumber);
  });

  // Pedidos de Delivery y Para Llevar (sin órdenes de mesa)
  const deliveryOrders = orders.filter(
    (o) => o.order_type !== 'EN_MESA' && !['COMPLETADO', 'CANCELADO'].includes(o.status)
  );

  return (
    <div className="space-y-6">
      {/* Cabecera y Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-zinc-900 tracking-tight">Caja y Cobranza</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Gestión de cuentas por mesa y despacho de pedidos a domicilio / para llevar.
          </p>
        </div>

        {/* Selector de Pestañas y Disponibilidad Rápida */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsAvailabilityOpen(true)}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-xs active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
          >
            <Ban className="w-4 h-4 text-red-400" />
            <span>Agotados (86) / Menú</span>
          </button>

          <div className="flex bg-zinc-100 p-1 rounded-xl border border-zinc-200 self-start sm:self-auto">
            <button
              onClick={() => setActiveTab('mesas')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'mesas'
                  ? 'bg-white text-orange-600 shadow-xs ring-1 ring-black/5'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <span>🍽️ Cuentas de Mesa (QR)</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                  activeTab === 'mesas' ? 'bg-orange-100 text-orange-700' : 'bg-zinc-200 text-zinc-700'
                }`}
              >
                {tableGroups.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('delivery')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'delivery'
                  ? 'bg-white text-indigo-600 shadow-xs ring-1 ring-black/5'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <span>🛵 Delivery y Para Llevar</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                  activeTab === 'delivery' ? 'bg-indigo-100 text-indigo-700' : 'bg-zinc-200 text-zinc-700'
                }`}
              >
                {deliveryOrders.length}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal de disponibilidad rápida */}
      <ProductAvailabilityManager
        locationId={locationId}
        isOpen={isAvailabilityOpen}
        onClose={() => setIsAvailabilityOpen(false)}
      />

      {/* Alertas */}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-sm font-semibold text-red-700 animate-in fade-in">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 text-sm font-semibold text-emerald-700 animate-in fade-in">
          {successMsg}
        </div>
      )}

      {/* ========================================================================= */}
      {/* PESTAÑA 1: CUENTAS DE MESA (QR)                                           */}
      {/* ========================================================================= */}
      {activeTab === 'mesas' && (
        <div className="space-y-4">
          {tableGroups.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-zinc-200 p-12 text-center">
              <div className="w-12 h-12 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center mx-auto mb-3">
                🍽️
              </div>
              <h3 className="text-base font-bold text-zinc-800">No hay cuentas de mesa abiertas</h3>
              <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
                Cuando los clientes pidan por QR en salón, sus comandas se agruparán automáticamente por mesa aquí para cobrar su cuenta consolidada.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              {tableGroups.map((group) => {
                const isCharging = chargingTableId === group.tableKey;
                const currentMethod = tablePaymentMethods[group.tableKey] || 'EFECTIVO_EXACTO';

                return (
                  <div
                    key={group.tableKey}
                    className="flex flex-col rounded-2xl border border-zinc-200 bg-white shadow-xs overflow-hidden transition-all hover:border-orange-200"
                  >
                    {/* Header de la Mesa */}
                    <div className="bg-gradient-to-r from-zinc-50 to-orange-50/40 border-b border-zinc-200 p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="w-9 h-9 rounded-xl bg-orange-600 text-white font-black text-sm flex items-center justify-center shadow-xs">
                            {group.tableNumber}
                          </span>
                          <div>
                            <h3 className="font-extrabold text-base text-zinc-900 leading-tight">
                              Mesa {group.tableNumber}
                            </h3>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500">
                              {group.zone && (
                                <span className="font-medium text-zinc-600">
                                  Zona {group.zone}
                                </span>
                              )}
                              <span>•</span>
                              <span>Inició {formatTime(group.firstOrderAt)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Estado en Cocina */}
                        <div>
                          {group.allServed ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                              ✅ Todo servido en mesa
                            </span>
                          ) : group.hasReady ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full animate-pulse">
                              🔔 Comanda lista para servir
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-full">
                              🔥 En preparación en cocina
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Desglose de Rondas / Comandas */}
                    <div className="p-4 space-y-3 flex-1">
                      <div className="flex items-center justify-between text-xs text-zinc-500 font-semibold uppercase tracking-wider">
                        <span>Historial de Comandas ({group.orders.length} {group.orders.length === 1 ? 'ronda' : 'rondas'})</span>
                        <span>Consolidado</span>
                      </div>

                      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                        {group.orders.map((order, rIdx) => (
                          <div
                            key={order.id}
                            className="p-3 rounded-xl bg-zinc-50/80 border border-zinc-200/80 text-xs space-y-1.5"
                          >
                            <div className="flex items-center justify-between border-b border-zinc-200/60 pb-1.5">
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-orange-900 bg-orange-100/80 px-2 py-0.5 rounded-md text-[11px]">
                                  Ronda #{rIdx + 1}
                                </span>
                                <span className="font-mono text-zinc-400 text-[11px]">
                                  {formatTime(order.created_at)}
                                </span>
                                <span className="text-zinc-500 truncate max-w-[130px]">
                                  {order.customer_name}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    order.status === 'COMPLETADO'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : order.status === 'LISTO'
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-purple-100 text-purple-800'
                                  }`}
                                >
                                  {order.status === 'COMPLETADO'
                                    ? 'Servido'
                                    : order.status === 'LISTO'
                                      ? 'Listo'
                                      : 'En cocina'}
                                </span>
                                <span className="font-bold text-zinc-800 font-mono">
                                  {formatMXN(order.total)}
                                </span>
                              </div>
                            </div>

                            {/* Platillos de esta ronda */}
                            <div className="space-y-1 pl-1">
                              {order.cart_snapshot.items.map((it, itIdx) => (
                                <div key={itIdx} className="flex justify-between items-start text-zinc-700">
                                  <div>
                                    <span className="font-semibold text-zinc-900">
                                      {it.quantity}× {it.product_name}
                                    </span>
                                    {it.modifiers?.length > 0 && (
                                      <span className="text-[11px] text-zinc-500 block">
                                        {it.modifiers.flatMap((m) => m.selections.map((s) => s.option_name)).join(', ')}
                                      </span>
                                    )}
                                    {it.comments && (
                                      <span className="text-amber-800 text-[10px] font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 block mt-0.5">
                                        ⚠️ {it.comments}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}

                              {(order.notes || (order.cart_snapshot as any)?.notes) && (
                                <div className="text-[10px] text-orange-900 bg-orange-50 p-1.5 rounded border border-orange-200">
                                  Nota: {order.notes || (order.cart_snapshot as any)?.notes}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Resumen Financiero y Acciones de Cobro */}
                    <div className="bg-zinc-50 border-t border-zinc-200 p-4 space-y-3">
                      <div className="flex items-baseline justify-between">
                        <div>
                          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                            Total Cuenta Mesa {group.tableNumber}
                          </span>
                          <div className="text-[11px] text-zinc-400">
                            Subtotal: {formatMXN(group.subtotal)} · IVA: {formatMXN(group.iva)}
                          </div>
                        </div>
                        <span className="text-2xl font-black text-zinc-900 font-mono">
                          {formatMXN(group.total)}
                        </span>
                      </div>

                      {/* Selector de Método de Pago y Cobro */}
                      <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <select
                          value={currentMethod}
                          onChange={(e) =>
                            setTablePaymentMethods((prev) => ({
                              ...prev,
                              [group.tableKey]: e.target.value as PaymentMethod,
                            }))
                          }
                          className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-xs focus:ring-2 focus:ring-orange-500"
                        >
                          <option value="EFECTIVO_EXACTO">💵 Efectivo exacto</option>
                          <option value="EFECTIVO_CON_CAMBIO">💵 Efectivo (con cambio)</option>
                          <option value="TARJETA_CONTRA_ENTREGA">💳 Tarjeta / Terminal</option>
                        </select>

                        <button
                          onClick={() => handleChargeTable(group)}
                          disabled={isCharging}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-2.5 shadow-sm transition active:scale-95 disabled:opacity-50"
                        >
                          {isCharging ? 'Cobrando...' : `💳 Cobrar Cuenta (${formatMXN(group.total)})`}
                        </button>

                        <button
                          onClick={() => setPreCuentaTable(group)}
                          className="inline-flex items-center justify-center gap-1 rounded-xl bg-zinc-200 hover:bg-zinc-300 text-zinc-800 font-bold text-xs px-3 py-2.5 transition active:scale-95"
                          title="Ver o imprimir pre-cuenta"
                        >
                          <span>🧾 Ticket</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* PESTAÑA 2: DELIVERY Y PARA LLEVAR                                         */}
      {/* ========================================================================= */}
      {activeTab === 'delivery' && (
        <div className="space-y-3">
          {deliveryOrders.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-zinc-200 p-12 text-center">
              <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3">
                🛵
              </div>
              <h3 className="text-base font-bold text-zinc-800">No hay pedidos de reparto o recoger activos</h3>
              <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
                Los pedidos a domicilio y para llevar aparecerán aquí para gestionar sus repartidores y entregas.
              </p>
            </div>
          ) : (
            deliveryOrders.map((order) => (
              <div
                key={order.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs gap-4"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-mono font-extrabold text-base text-zinc-900">
                      #{order.id.slice(0, 8).toUpperCase()}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        order.status === 'CREADO'
                          ? 'bg-blue-100 text-blue-700'
                          : order.status === 'CONFIRMADO_CAJA'
                            ? 'bg-amber-100 text-amber-700'
                            : order.status === 'EN_PREPARACION'
                              ? 'bg-purple-100 text-purple-700'
                              : order.status === 'LISTO'
                                ? 'bg-emerald-100 text-emerald-700'
                                : order.status === 'LISTO_PARA_ENTREGA'
                                  ? 'bg-indigo-100 text-indigo-700'
                                  : 'bg-zinc-100 text-zinc-700'
                      }`}
                    >
                      {order.status === 'CREADO' && 'Nuevo'}
                      {order.status === 'CONFIRMADO_CAJA' && 'En cola de cocina'}
                      {order.status === 'EN_PREPARACION' && 'En preparación'}
                      {order.status === 'LISTO' &&
                        (order.order_type === 'RECOGER' ? 'Listo para recoger' : 'Listo para entrega')}
                      {order.status === 'LISTO_PARA_ENTREGA' && 'En camino'}
                      {order.status === 'COMPLETADO' && 'Entregado'}
                      {order.status === 'CANCELADO' && 'Cancelado'}
                    </span>
                  </div>

                  <p className="text-sm text-zinc-700 font-medium">
                    {orderTypeLabel(order.order_type)} · {order.customer_name}
                    {order.order_type === 'DOMICILIO' && order.delivery_address
                      ? ` · ${order.delivery_address}`
                      : ''}
                  </p>

                  <p className="text-xs text-zinc-400">
                    {order.cart_snapshot.items.length} líneas · ETA{' '}
                    {new Date(order.eta).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                  </p>

                  {/* Lista de productos */}
                  <div className="mt-2 space-y-1.5 text-xs bg-zinc-50 border border-zinc-200/80 rounded-xl p-2.5 max-w-xl">
                    {order.cart_snapshot.items.map((it, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between items-start gap-2 border-b border-zinc-100 last:border-b-0 pb-1 last:pb-0"
                      >
                        <div>
                          <span className="font-semibold text-zinc-900">
                            {it.quantity}× {it.product_name}
                          </span>
                          {it.modifiers?.length > 0 && (
                            <span className="text-zinc-500 text-[11px] block">
                              {it.modifiers.flatMap((m) => m.selections.map((s) => s.option_name)).join(', ')}
                            </span>
                          )}
                          {it.comments && (
                            <span className="text-amber-800 text-[11px] font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 block mt-0.5">
                              ⚠️ Obs: {it.comments}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {(order.notes || (order.cart_snapshot as any)?.notes) && (
                      <div className="mt-1 pt-1.5 border-t border-zinc-200 text-orange-950 font-medium text-[11px]">
                        <span className="font-bold text-orange-800 uppercase text-[10px] block">Nota comanda:</span>
                        <span>{order.notes || (order.cart_snapshot as any)?.notes}</span>
                      </div>
                    )}
                  </div>

                  {/* Reparto (solo DOMICILIO): asignación y link */}
                  {order.order_type === 'DOMICILIO' && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                      {driverSelectFor === order.id ? (
                        <select
                          defaultValue={order.driver_id ?? ''}
                          onChange={(e) => handleAssignDriver(order.id, e.target.value)}
                          onBlur={() => setDriverSelectFor(null)}
                          className="rounded-lg border border-zinc-300 px-2 py-1 text-xs"
                          autoFocus
                        >
                          <option value="">— Sin asignar —</option>
                          {drivers.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.full_name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <button
                          onClick={() => setDriverSelectFor(order.id)}
                          className="text-indigo-600 hover:underline font-semibold"
                        >
                          🛵{' '}
                          {order.driver_id
                            ? drivers.find((d) => d.id === order.driver_id)?.full_name ?? 'Repartidor asignado'
                            : 'Asignar repartidor'}
                        </button>
                      )}

                      <button
                        onClick={() => handleGetDeliveryLink(order.id)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                          copiedOrderId === order.id
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-zinc-800 text-white hover:bg-zinc-700 active:scale-95'
                        }`}
                        title="Copiar link de entrega para el repartidor"
                      >
                        {copiedOrderId === order.id ? (
                          <span>✓ ¡Link copiado!</span>
                        ) : (
                          <span>📋 Copiar link repartidor</span>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4 self-end sm:self-center">
                  <div className="text-right">
                    <span className="font-mono font-bold text-base text-zinc-900">
                      {formatMXN(order.total)}
                    </span>

                    {discountingOrderId === order.id ? (
                      <div className="mt-2 flex items-center gap-1.5">
                        <input
                          type="number"
                          value={manualAmount}
                          onChange={(e) => setManualAmount(e.target.value)}
                          className="w-16 rounded border border-zinc-300 px-2 py-1 text-xs"
                          placeholder="$"
                        />
                        <button
                          onClick={() => handleApplyManualDiscount(order.id)}
                          className="text-xs bg-emerald-600 text-white px-2 py-1 rounded font-bold"
                        >
                          OK
                        </button>
                        <button
                          onClick={() => {
                            setDiscountingOrderId(null);
                            setManualAmount('');
                          }}
                          className="text-xs bg-zinc-200 px-2 py-1 rounded text-zinc-700"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDiscountingOrderId(order.id)}
                        className="ml-2 text-xs text-indigo-600 hover:underline block"
                      >
                        Descuento
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {order.status === 'CREADO' && (
                      <>
                        <button
                          onClick={() => handleAction(order.id, 'CONFIRMADO_CAJA')}
                          className="rounded-xl bg-orange-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-orange-700 transition active:scale-95"
                        >
                          Mandar a cocina
                        </button>
                        <button
                          onClick={() => handleAction(order.id, 'CANCELADO')}
                          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 transition active:scale-95"
                        >
                          Rechazar
                        </button>
                      </>
                    )}
                    {order.status === 'CONFIRMADO_CAJA' && (
                      <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
                        En cola cocina
                      </span>
                    )}
                    {order.status === 'EN_PREPARACION' && (
                      <span className="text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-lg">
                        En preparación...
                      </span>
                    )}
                    {order.status === 'LISTO' && (
                      <>
                        {order.order_type === 'RECOGER' ? (
                          <button
                            onClick={() => handleAction(order.id, 'COMPLETADO')}
                            className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition active:scale-95"
                          >
                            Confirmar entrega
                          </button>
                        ) : (
                          <button
                            onClick={async () => {
                              await handleAction(order.id, 'LISTO_PARA_ENTREGA');
                              handleGetDeliveryLink(order.id);
                            }}
                            className="rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition active:scale-95"
                          >
                            Enviar con repartidor
                          </button>
                        )}
                      </>
                    )}
                    {order.status === 'LISTO_PARA_ENTREGA' && order.order_type === 'DOMICILIO' && (
                      <button
                        onClick={() => handleAction(order.id, 'COMPLETADO')}
                        className="rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-zinc-800 transition active:scale-95"
                      >
                        Marcar entregado
                      </button>
                    )}
                    {order.status !== 'CREADO' && (
                      <button
                        onClick={() => handleAction(order.id, 'CANCELADO')}
                        className="rounded-xl border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 transition active:scale-95"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DE PRE-CUENTA / TICKET DE MESA                                      */}
      {/* ========================================================================= */}
      {preCuentaTable && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-zinc-200">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-lg font-black text-zinc-900">Pre-cuenta · Mesa {preCuentaTable.tableNumber}</h3>
                <p className="text-xs text-zinc-500">
                  {preCuentaTable.zone ? `Zona: ${preCuentaTable.zone} · ` : ''}
                  Hora inicio: {formatTime(preCuentaTable.firstOrderAt)}
                </p>
              </div>
              <button
                onClick={() => setPreCuentaTable(null)}
                className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-600 flex items-center justify-center text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Detalle consolidado para el ticket */}
            <div className="font-mono text-xs space-y-3 max-h-80 overflow-y-auto pr-1">
              <div className="border-b border-dashed pb-2 space-y-2">
                {preCuentaTable.orders.map((ord, idx) => (
                  <div key={ord.id} className="space-y-1">
                    <div className="font-bold text-zinc-900 flex justify-between text-[11px] bg-zinc-50 p-1 rounded">
                      <span>Ronda #{idx + 1} ({formatTime(ord.created_at)})</span>
                      <span>{formatMXN(ord.total)}</span>
                    </div>
                    {ord.cart_snapshot.items.map((item, itIdx) => (
                      <div key={itIdx} className="flex justify-between text-zinc-700 pl-2">
                        <span>{item.quantity}× {item.product_name}</span>
                        <span>{formatMXN(item.base_price * item.quantity)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div className="space-y-1 pt-1 text-right">
                <div className="flex justify-between text-zinc-600">
                  <span>Subtotal:</span>
                  <span>{formatMXN(preCuentaTable.subtotal)}</span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>IVA Incluido:</span>
                  <span>{formatMXN(preCuentaTable.iva)}</span>
                </div>
                <div className="flex justify-between text-base font-black text-zinc-900 pt-2 border-t border-zinc-900">
                  <span>TOTAL A PAGAR:</span>
                  <span>{formatMXN(preCuentaTable.total)}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-zinc-100">
              <button
                onClick={() => window.print()}
                className="flex-1 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs py-2.5 transition active:scale-95 flex items-center justify-center gap-1.5"
              >
                <span>🖨️ Imprimir Ticket</span>
              </button>
              <button
                onClick={() => setPreCuentaTable(null)}
                className="rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs px-4 py-2.5 transition active:scale-95"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-emerald-600 flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
        <span>Realtime activo — las comandas de mesas y entregas se actualizan en vivo.</span>
      </p>
    </div>
  );
}
