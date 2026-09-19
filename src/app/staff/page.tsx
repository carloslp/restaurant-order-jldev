// src/app/staff/page.tsx
import { redirect } from 'next/navigation';
import { createSessionServerClient } from '@/lib/supabase/session';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Función helper: obtener sesión + staff + local del usuario autenticado.
// Auto-crea el registro de staff si no existe (cualquier usuario autenticado puede acceder).
export async function getCurrentStaff() {
  const supabase = await createSessionServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const adminSupabase = createServerClient();

  // 1. Buscar por auth_user_id
  let { data: staff } = await adminSupabase
    .from('staff')
    .select('id, location_id, email, full_name, is_active, auth_user_id, created_at, updated_at, created_by, updated_by')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  // 2. Fallback: buscar por email
  if (!staff) {
    const { data: staffByEmail } = await adminSupabase
      .from('staff')
      .select('id, location_id, email, full_name, is_active, auth_user_id, created_at, updated_at, created_by, updated_by')
      .eq('email', user.email)
      .maybeSingle();
    staff = staffByEmail;
  }

  // 3. Si existe por email pero sin auth_user_id, vincularlo
  if (staff && !staff.auth_user_id) {
    await adminSupabase
      .from('staff')
      .update({ auth_user_id: user.id })
      .eq('id', staff.id);
    staff.auth_user_id = user.id;
  }

  // 4. Si no existe, auto-crear en el primer local disponible
  if (!staff) {
    const { data: firstLocal } = await adminSupabase
      .from('locals')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (!firstLocal) {
      console.error('No hay locales configurados. Ejecuta el setup primero.');
      redirect('/setup');
    }

    // Configurar GUC para bypass RLS check
    await adminSupabase.rpc('set_config', {
      name: 'app.local_id',
      value: firstLocal.id,
      is_local: true,
    });

    // Debug: verificar qué key está usando el cliente
    console.log('AdminSupabase client created, attempting insert...');
    console.log('firstLocal.id:', firstLocal.id);
    console.log('user.email:', user.email);
    console.log('user.id:', user.id);

    const { data: newStaff, error: createError } = await adminSupabase
      .from('staff')
      .insert({
        email: user.email!,
        full_name: user.user_metadata?.full_name ?? user.email!.split('@')[0],
        is_active: true,
        location_id: firstLocal.id,
        auth_user_id: user.id,
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creando staff automáticamente:', JSON.stringify(createError, null, 2));
      // Mostrar el error completo en la URL para debug
      redirect(`/login?error=staff_create_failed&details=${encodeURIComponent(createError.message)}&code=${createError.code}&hint=${encodeURIComponent(createError.hint ?? '')}`);
    }

    staff = newStaff;
  }

  // Garantía de no-null para todos los consumidores (caja, kds, admin, staff).
  if (!staff) {
    redirect('/login?error=staff_resolve_failed');
  }

  // 5. Cargar local
  const { data: local } = await supabase
    .from('locals')
    .select('id, name, slug, timezone, iva_rate, delivery_fee, created_at, updated_at')
    .eq('id', staff.location_id)
    .maybeSingle();

  return {
    user,
    staff,
    local: local ?? null,
  };
}

export default async function StaffDashboardPage() {
  const { staff, local } = await getCurrentStaff();

  // Redirigir siempre al panel de administración ya que no hay roles
  redirect('/staff/admin');
}