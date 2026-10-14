'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getCurrentStaff } from '@/app/staff/page';
import type { OrderStatus, PaymentMethod, OrderType } from '@/lib/types';

interface OrderForExport {
  id: string;
  created_at: string;
  status: OrderStatus;
  order_type: OrderType;
  payment_method: PaymentMethod | null;
  total_amount?: number;
  subtotal: number;
  iva_amount: number;
  delivery_fee_amount: number;
  total: number;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  delivery_address: string | null;
  delivery_zone?: string | null;
  delivery_fee?: number | null;
  delivery_references: string | null;
  eta: string | null;
  delivered_at: string | null;
  notes?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
}

async function getStaffContext() {
  const { staff } = await getCurrentStaff();
  return staff;
}

function setLocationGUC(supabase: ReturnType<typeof createServerClient>, locationId: string) {
  return supabase.rpc('set_config', {
    name: 'app.local_id',
    value: locationId,
    is_local: true,
  });
}

export interface KPIData {
  totalOrders: number;
  totalRevenue: number;
  averageTicket: number;
  ordersByStatus: Record<OrderStatus, number>;
  ordersByType: Record<OrderType, number>;
  ordersByPaymentMethod: Record<PaymentMethod, number>;
  revenueByDay: Array<{ date: string; revenue: number; orders: number }>;
  topProducts: Array<{ product_id: string; product_name: string; quantity: number; revenue: number }>;
  topCategories: Array<{ category_id: string; category_name: string; quantity: number; revenue: number }>;
}

export interface CashRegisterData {
  orders: Array<{
    id: string;
    status: OrderStatus;
    payment_method: PaymentMethod;
    total: number;
    delivered_at: string | null;
    created_at: string;
    customer_name: string;
  }>;
  cashExpected: number;
  cardExpected: number;
  cashOnDeliveryExpected: number;
  totalsByPaymentMethod: Record<PaymentMethod, number>;
}

export async function getKPIs(dateFrom: string, dateTo: string): Promise<KPIData> {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  await setLocationGUC(supabase, staff.location_id);

  // Fetch orders in date range with minimal columns (saves egress on heavy order snapshots)
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, status, order_type, payment_method, total, subtotal, delivery_fee_amount, cart_snapshot, created_at, delivered_at')
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const orderList = (orders ?? []) as unknown as Array<{
    id: string;
    status: OrderStatus;
    order_type: OrderType;
    payment_method: PaymentMethod;
    total: number;
    subtotal: number;
    delivery_fee_amount: number;
    cart_snapshot: { items: Array<{ product_id: string; product_name: string; base_price: number; quantity: number }> };
    created_at: string;
    delivered_at: string | null;
  }>;

  // Calculate KPIs
  const completedOrders = orderList.filter((o) => o.status === 'COMPLETADO');
  const totalRevenue = completedOrders.reduce((sum, o) => sum + Number(o.total), 0);
  const totalOrders = completedOrders.length;
  const averageTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Orders by status
  const ordersByStatus: Record<OrderStatus, number> = {
    CREADO: 0,
    CONFIRMADO_CAJA: 0,
    EN_PREPARACION: 0,
    LISTO: 0,
    LISTO_PARA_ENTREGA: 0,
    COMPLETADO: 0,
    CANCELADO: 0,
  };
  orderList.forEach((o) => {
    ordersByStatus[o.status] = (ordersByStatus[o.status] || 0) + 1;
  });

  // Orders by type
  const ordersByType: Record<OrderType, number> = {
    RECOGER: 0,
    DOMICILIO: 0,
    EN_MESA: 0,
  };
  orderList.forEach((o) => {
    ordersByType[o.order_type] = (ordersByType[o.order_type] || 0) + 1;
  });

  // Orders by payment method
  const ordersByPaymentMethod: Record<PaymentMethod, number> = {
    EFECTIVO_EXACTO: 0,
    EFECTIVO_CON_CAMBIO: 0,
    TARJETA_CONTRA_ENTREGA: 0,
  };
  orderList.forEach((o) => {
    ordersByPaymentMethod[o.payment_method] = (ordersByPaymentMethod[o.payment_method] || 0) + 1;
  });

  // Revenue by day
  const revenueByDayMap = new Map<string, { revenue: number; orders: number }>();
  completedOrders.forEach((o) => {
    const date = o.created_at.split('T')[0];
    const current = revenueByDayMap.get(date) || { revenue: 0, orders: 0 };
    current.revenue += Number(o.total);
    current.orders += 1;
    revenueByDayMap.set(date, current);
  });
  const revenueByDay = Array.from(revenueByDayMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Top products
  const productMap = new Map<string, { product_id: string; product_name: string; quantity: number; revenue: number }>();
  completedOrders.forEach((o) => {
    o.cart_snapshot.items.forEach((item) => {
      const current = productMap.get(item.product_id) || {
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: 0,
        revenue: 0,
      };
      current.quantity += item.quantity;
      current.revenue += Number(item.base_price) * item.quantity;
      productMap.set(item.product_id, current);
    });
  });
  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  // Top categories (need to join with products)
  const { data: products } = await supabase
    .from('products')
    .select('id, category_id, name')
    .eq('location_id', staff.location_id);

  const productCategoryMap = new Map<string, string>();
  products?.forEach((p) => productCategoryMap.set(p.id, p.category_id));

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name')
    .eq('location_id', staff.location_id);

  const categoryNameMap = new Map<string, string>();
  categories?.forEach((c) => categoryNameMap.set(c.id, c.name));

  const categoryMap = new Map<string, { category_id: string; category_name: string; quantity: number; revenue: number }>();
  completedOrders.forEach((o) => {
    o.cart_snapshot.items.forEach((item) => {
      const catId = productCategoryMap.get(item.product_id);
      if (!catId) return;
      const current = categoryMap.get(catId) || {
        category_id: catId,
        category_name: categoryNameMap.get(catId) || 'Sin categoría',
        quantity: 0,
        revenue: 0,
      };
      current.quantity += item.quantity;
      current.revenue += Number(item.base_price) * item.quantity;
      categoryMap.set(catId, current);
    });
  });
  const topCategories = Array.from(categoryMap.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  return {
    totalOrders,
    totalRevenue,
    averageTicket,
    ordersByStatus,
    ordersByType,
    ordersByPaymentMethod,
    revenueByDay,
    topProducts,
    topCategories,
  };
}

export async function getCashRegisterData(date: string): Promise<CashRegisterData> {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  await setLocationGUC(supabase, staff.location_id);

  const startOfDay = `${date}T00:00:00`;
  const endOfDay = `${date}T23:59:59`;

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, status, payment_method, total, delivered_at, created_at, customer_name')
    .eq('location_id', staff.location_id)
    .gte('created_at', startOfDay)
    .lte('created_at', endOfDay)
    .in('status', ['COMPLETADO', 'CANCELADO'])
    .order('created_at', { ascending: true });

  if (error) throw error;

  const orderList = (orders ?? []) as Array<{
    id: string;
    status: OrderStatus;
    payment_method: PaymentMethod;
    total: number;
    delivered_at: string | null;
    created_at: string;
    customer_name: string;
  }>;

  const completedOrders = orderList.filter((o) => o.status === 'COMPLETADO');

  const totalsByPaymentMethod: Record<PaymentMethod, number> = {
    EFECTIVO_EXACTO: 0,
    EFECTIVO_CON_CAMBIO: 0,
    TARJETA_CONTRA_ENTREGA: 0,
  };

  completedOrders.forEach((o) => {
    totalsByPaymentMethod[o.payment_method] = (totalsByPaymentMethod[o.payment_method] || 0) + Number(o.total);
  });

  const cashExpected = totalsByPaymentMethod.EFECTIVO_EXACTO + totalsByPaymentMethod.EFECTIVO_CON_CAMBIO;
  const cardExpected = totalsByPaymentMethod.TARJETA_CONTRA_ENTREGA;

  return {
    orders: orderList,
    cashExpected,
    cardExpected,
    cashOnDeliveryExpected: totalsByPaymentMethod.TARJETA_CONTRA_ENTREGA,
    totalsByPaymentMethod,
  };
}

export async function exportOrdersCSV(dateFrom: string, dateTo: string): Promise<string> {
  const staff = await getStaffContext();
  const supabase = createServerClient();

  await setLocationGUC(supabase, staff.location_id);

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, created_at, status, order_type, payment_method, customer_name, customer_phone, subtotal, iva_amount, delivery_fee_amount, total, delivery_address, delivery_references, eta, delivered_at, created_by, updated_by')
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const headers = [
    'ID',
    'Fecha',
    'Estado',
    'Tipo',
    'Método Pago',
    'Cliente',
    'Teléfono',
    'Subtotal',
    'IVA',
    'Envío',
    'Total',
    'Dirección',
    'Referencias',
    'ETA',
    'Entregado',
    'Creado por',
    'Actualizado por',
  ];

  const rows = ((orders ?? []) as unknown as OrderForExport[]).map((o) => [
    o.id,
    o.created_at,
    o.status,
    o.order_type,
    o.payment_method ?? '',
    o.customer_name,
    o.customer_phone,
    Number(o.subtotal || 0).toFixed(2),
    Number(o.iva_amount || 0).toFixed(2),
    Number(o.delivery_fee_amount || 0).toFixed(2),
    Number(o.total || 0).toFixed(2),
    o.delivery_address ?? '',
    o.delivery_references ?? '',
    o.eta ?? '',
    o.delivered_at ?? '',
    o.created_by ?? '',
    o.updated_by ?? '',
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
  return csv;
}