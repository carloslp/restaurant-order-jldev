// src/app/staff/kds/page.tsx
import { redirect } from 'next/navigation';
import { getCurrentStaff } from '@/app/staff/page';
import { KitchenDisplay } from '@/features/staff/KitchenDisplay';

export const dynamic = 'force-dynamic';

export default async function KdsPage() {
  const { staff } = await getCurrentStaff();

  // Cualquier usuario autenticado con staff puede acceder
  return <KitchenDisplay locationId={staff.location_id} />;
}