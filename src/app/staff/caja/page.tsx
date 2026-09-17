// src/app/staff/caja/page.tsx
import { redirect } from 'next/navigation';
import { getCurrentStaff } from '@/app/staff/page';
import { CashierView } from '@/features/staff/CashierView';

export const dynamic = 'force-dynamic';

export default async function CajaPage() {
  const { staff } = await getCurrentStaff();

  // Caja: cajero o admin
  const role = staff.role?.toUpperCase();
  if (role !== 'CAJERO' && role !== 'ADMIN') {
    redirect('/staff');
  }

  return <CashierView locationId={staff.location_id} />;
}