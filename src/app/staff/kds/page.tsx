// src/app/staff/kds/page.tsx
import { redirect } from 'next/navigation';
import { getCurrentStaff } from '@/app/staff/page';
import { KitchenDisplay } from '@/features/staff/KitchenDisplay';

export const dynamic = 'force-dynamic';

export default async function KdsPage() {
  const { staff } = await getCurrentStaff();

  // Solo cocineros (o admin) pueden ver el KDS; el layout ya protege la sesión.
  const role = staff.role?.toUpperCase();
  if (role !== 'COCINERO' && role !== 'ADMIN') {
    redirect('/staff');
  }

  // Pasamos locationId; el componente (client) se encarga de cargar + suscribirse.
  return <KitchenDisplay locationId={staff.location_id} />;
}