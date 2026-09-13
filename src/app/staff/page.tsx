// src/app/staff/page.tsx
import { redirect } from 'next/navigation';
import { createSessionServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Función helper: obtener sesión + staff + local del usuario autenticado.
export async function getCurrentStaff() {
  const supabase = await createSessionServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    redirect('/staff/login');
  }

  // Buscar en tabla staff por email (auth.users es la fuente, staff es el perfil)
  const { data: staff, error } = await supabase
    .from('staff')
    .select('*')
    .eq('email', session.user.email)
    .maybeSingle();

  if (error || !staff) {
    console.error('No staff profile for user:', error ?? 'not found');
    redirect('/staff/login?error=no_staff');
  }

  // Cargar local (para nombre y timezone)
  const { data: local } = await supabase
    .from('locals')
    .select('id, name, subdomain, timezone, iva_rate, delivery_fee')
    .eq('id', staff.location_id)
    .maybeSingle();

  return {
    session,
    staff,
    local: local ?? null,
  };
}

export default async function StaffDashboardPage() {
  const { staff, local } = await getCurrentStaff();

  // Redirigir a la vista según rol
  switch (staff.role) {
    case 'COCINERO':
      redirect('/staff/kds');
    case 'CAJERO':
      redirect('/staff/caja');
    default:
      redirect('/staff/admin');
  }
}