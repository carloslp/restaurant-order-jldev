import { redirect } from 'next/navigation';
import { createSessionServerClient } from '@/lib/supabase/session';
import { StaffNav } from '@/features/staff/StaffNav';
import { checkSystemInitialized } from '@/lib/server/setup';
import { getCurrentStaff } from '@/app/staff/page';
import { listLocals } from '@/lib/server/locals';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export default async function StaffLayout({ children }: { children: ReactNode }) {
  const supabase = await createSessionServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Si no hay locales en BD, redirigir al setup (solo para staff)
  const isInitialized = await checkSystemInitialized();
  if (!isInitialized) {
    redirect('/setup');
  }

  const { staff, local } = await getCurrentStaff();
  let locals: any[] = [];
  try {
    locals = await listLocals();
  } catch (e) {
    console.error('Error fetching locals for StaffNav:', e);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <StaffNav
        userEmail={user.email ?? ''}
        locals={locals}
        activeLocalId={local?.id ?? staff.location_id}
        currentIsOpen={local?.is_open !== false}
      />
      <main className="mx-auto max-w-6xl p-4 sm:p-6">{children}</main>
    </div>
  );
}