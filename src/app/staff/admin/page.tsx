// src/app/staff/admin/page.tsx
import { getCurrentStaff } from '@/app/staff/page';
import { AdminView } from '@/features/staff/AdminView';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const { staff, local } = await getCurrentStaff();

  const role = staff.role?.toUpperCase();
  if (role !== 'ADMIN') {
    return (
      <div className="rounded-md bg-yellow-50 p-6 text-sm text-yellow-800">
        Acceso restringido: solo administradores pueden ver esta página.
      </div>
    );
  }

  return <AdminView staff={staff} local={local} />;
}