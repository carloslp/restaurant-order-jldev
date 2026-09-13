// src/app/staff/auth/callback/route.ts
import { NextResponse } from 'next/server';
import { createSessionServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/staff';

  if (code) {
    const supabase = await createSessionServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error('Error intercambiando code:', error);
  }

  return NextResponse.redirect(`${origin}/staff/login?error=1`);
}