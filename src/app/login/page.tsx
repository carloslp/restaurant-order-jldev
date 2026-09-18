// src/app/staff/login/page.tsx
import { redirect } from 'next/navigation';
import { createSessionServerClient } from '@/lib/supabase/session';
import { SignInForm } from '@/features/staff/SignInForm';

export const dynamic = 'force-dynamic';

export default async function StaffLoginPage() {
  const supabase = await createSessionServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect('/staff');
  }

  return <SignInForm />;
}