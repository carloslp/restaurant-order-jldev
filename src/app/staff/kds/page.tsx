// src/app/staff/kds/page.tsx
import { redirect } from 'next/navigation';
import { listOrdersForLocation } from '@/lib/server/order';
import { getCurrentStaff } from '@/app/staff/page';
import { KitchenDisplay } from '@/features/staff/KitchenDisplay';
import type { Order } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function KdsPage() {
  const { staff } = await getCurrentStaff();

  // Solo cocineros (o admin) pueden ver el KDS; el layout ya protege la sesión.
  if (staff.role !== 'COCINERO' && staff.role !== 'ADMIN') {
    redirect('/staff');
  }

  const orders: Order[] = await listOrdersForLocation({
    statuses: ['CONFIRMADO_CAJA', 'EN_PREPARACION', 'LISTO'],
  });

  return <KitchenDisplay orders={orders} />;
}