// src/app/staff/caja/page.tsx
import { redirect } from 'next/navigation';
import { listOrdersForLocation } from '@/lib/server/order';
import { getCurrentStaff } from '@/app/staff/page';
import { CashierView } from '@/features/staff/CashierView';
import type { Order } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function CajaPage() {
  const { staff } = await getCurrentStaff();

  // Caja: cajero o admin
  if (staff.role !== 'CAJERO' && staff.role !== 'ADMIN') {
    redirect('/staff');
  }

  const orders: Order[] = await listOrdersForLocation({
    statuses: ['CREADO', 'CONFIRMADO_CAJA', 'EN_PREPARACION', 'LISTO', 'LISTO_PARA_ENTREGA'],
  });

  return <CashierView orders={orders} />;
}