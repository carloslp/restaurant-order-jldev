// src/app/staff/caja/page.tsx
import { redirect } from 'next/navigation';
import { getCurrentStaff } from '@/app/staff/page';
import { CashierView } from '@/features/staff/CashierView';

export const dynamic = 'force-dynamic';

export default async function CajaPage() {
  const { staff } = await getCurrentStaff();

  // Cualquier usuario autenticado con staff puede acceder
  return <CashierView locationId={staff.location_id} />;
}