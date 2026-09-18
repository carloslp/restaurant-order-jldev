// src/app/staff/admin/page.tsx
import { getCurrentStaff } from '@/app/staff/page';
import { AdminView } from '@/features/staff/AdminView';
import { ToastProvider } from '@/components/ui/use-toast';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const { staff, local } = await getCurrentStaff();

  // Cualquier usuario autenticado con staff puede acceder al panel admin
  return (
    <ToastProvider>
      <AdminView staff={staff} local={local} />
    </ToastProvider>
  );
}