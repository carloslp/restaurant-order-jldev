// src/app/staff/auth/callback/route.ts
import { NextResponse } from 'next/server';
import { createSessionServerClient } from '@/lib/supabase/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/staff';

  if (code) {
    const supabase = await createSessionServerClient();
    const { error, data: sessionData } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && sessionData?.session) {
      // After successful sign-in, enrich the user's user_metadata with staff info
      const { data: staff, error: staffError } = await supabase
        .from('staff')
        .select('location_id, role, full_name')
        .eq('email', sessionData.session.user.email)
        .single();

      if (!staffError && staff) {
        // Update the auth user's user_metadata using service_role
        const adminSupabase = await createServerClient();
        await adminSupabase.auth.admin.updateUserById(
          sessionData.session.user.id,
          { user_metadata: { location_id: staff.location_id, role: staff.role, full_name: staff.full_name } }
        );
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error('Error intercambiando code:', error);
  }

  return NextResponse.redirect(`${origin}/login?error=1`);
}