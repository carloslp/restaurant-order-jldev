// src/app/staff/layout.tsx
import { redirect } from 'next/navigation';
import { createSessionServerClient } from '@/lib/supabase/session';
import { StaffNav } from '@/features/staff/StaffNav';
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

  return (
    <div className="min-h-screen bg-gray-50">
      <StaffNav userEmail={user.email ?? ''} />
      <main className="mx-auto max-w-6xl p-6">{children}</main>
    </div>
  );
}