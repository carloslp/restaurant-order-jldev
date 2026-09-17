// src/app/staff/login/page.tsx
import { redirect } from 'next/navigation';
import { createSessionServerClient } from '@/lib/supabase/server';
import { SignInForm } from '@/features/staff/SignInForm';

export const dynamic = 'force-dynamic';

export default async function StaffLoginPage() {
  const supabase = await createSessionServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    redirect('/staff');
  }

  return <SignInForm />;
}