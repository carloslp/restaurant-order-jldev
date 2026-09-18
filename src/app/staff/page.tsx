// src/app/staff/page.tsx
import { redirect } from 'next/navigation';
import { createSessionServerClient } from '@/lib/supabase/session';
import { createServerClient } from '@/lib/supabase/server';
import { signOut } from '@/features/staff/auth';

export const dynamic = 'force-dynamic';

// Función helper: obtener sesión + staff + local del usuario autenticado.
export async function getCurrentStaff() {
  const supabase = await createSessionServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Buscar en tabla staff por auth_user_id (vinculación directa con auth.users)
  // Use service role client to bypass RLS on staff table
  const adminSupabase = createServerClient();
  const { data: staff, error } = await adminSupabase
    .from('staff')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  // Fallback: si no hay auth_user_id vinculado, buscar por email (compatibilidad)
  let foundStaff = staff;
  if (!foundStaff && !error) {
    const { data: staffByEmail } = await adminSupabase
      .from('staff')
      .select('*')
      .eq('email', user.email)
      .maybeSingle();
    foundStaff = staffByEmail;
  }

  if (!foundStaff) {
    console.error('No staff profile for user:', error ?? 'not found');
    redirect('/login?error=no_staff');
  }

  // Cargar local (para nombre y timezone)
  const { data: local } = await supabase
    .from('locals')
    .select('id, name, subdomain, timezone, iva_rate, delivery_fee')
    .eq('id', staff.location_id)
    .maybeSingle();

  return {
    user,
    staff: foundStaff,
    local: local ?? null,
  };
}

export default async function StaffDashboardPage() {
  const { staff, local } = await getCurrentStaff();

  // Redirigir siempre al panel de administración ya que no hay roles
  redirect('/staff/admin');
}