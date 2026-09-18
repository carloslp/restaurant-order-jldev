// src/app/staff/auth/callback/route.ts
import { NextResponse } from 'next/server';
import { createSessionServerClient } from '@/lib/supabase/session';
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
      // Use service role client to bypass RLS on staff table
      const adminSupabase = createServerClient();
      const { data: staff, error: staffError } = await adminSupabase
        .from('staff')
        .select('id, location_id, role, full_name, auth_user_id')
        .eq('email', sessionData.session.user.email)
        .single();

      if (!staffError && staff) {
        // Update the auth user's user_metadata using service_role
        await adminSupabase.auth.admin.updateUserById(
          sessionData.session.user.id,
          { user_metadata: { location_id: staff.location_id, role: staff.role, full_name: staff.full_name } }
        );
        // Also link staff record to auth user for future reliable lookups
        if (!staff.auth_user_id) {
          await adminSupabase
            .from('staff')
            .update({ auth_user_id: sessionData.session.user.id })
            .eq('id', staff.id);
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error('Error intercambiando code:', error);
  }

  return NextResponse.redirect(`${origin}/login?error=1`);
}