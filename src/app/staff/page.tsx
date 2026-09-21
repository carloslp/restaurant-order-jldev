// src/app/staff/page.tsx
import { redirect } from 'next/navigation';
import { createSessionServerClient } from '@/lib/supabase/session';
import { createServerClient } from '@/lib/supabase/server';
import { describeSupabaseError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

// Función helper: obtener sesión + staff + local del usuario autenticado.
// El alta de staff es MANUAL (wizard /setup, invitación desde el panel admin o
// SQL): el sistema NUNCA auto-crea registros de staff.
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
  const byAuthId = await adminSupabase
    .from('staff')
    .select('id, location_id, email, full_name, is_active, auth_user_id, created_at, updated_at')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  // Un fallo de consulta (red, 5xx, etc.) NO significa "no hay staff":
  // avisar y dejar la sesión intacta para reintentar, sin cerrarla.
  if (byAuthId.error) {
    console.error(`getCurrentStaff/lookup_error: ${describeSupabaseError(byAuthId.error)}`);
    redirect('/login?error=staff_lookup_failed');
  }
  let staff = byAuthId.data;

  // 2. Fallback: buscar por email
  if (!staff) {
    const byEmail = await adminSupabase
      .from('staff')
      .select('id, location_id, email, full_name, is_active, auth_user_id, created_at, updated_at')
      .eq('email', user.email)
      .maybeSingle();

    if (byEmail.error) {
      console.error(`getCurrentStaff/lookup_error: ${describeSupabaseError(byEmail.error)}`);
      redirect('/login?error=staff_lookup_failed');
    }
    staff = byEmail.data;
  }

  // 3. Si existe por email pero sin auth_user_id, vincularlo
  if (staff && !staff.auth_user_id) {
    await adminSupabase
      .from('staff')
      .update({ auth_user_id: user.id })
      .eq('id', staff.id);
    staff.auth_user_id = user.id;
  }

  // 4. Sin registro de staff: cerrar sesión y avisar en /login (el alta es
  //    manual, el sistema no auto-crea). Vía route handler porque un Server
  //    Component no puede escribir cookies; y redirigir a /login con sesión
  //    activa sería un bucle (login re-redirige a /staff).
  if (!staff) {
    console.error(
      `getCurrentStaff/no_staff: usuario autenticado sin registro de staff (user_id=${user.id}, email=${user.email ?? 'n/d'}). Cerrando sesión.`
    );
    redirect('/staff/auth/logout?reason=no_staff');
  }

  // 5. Cargar local (service role, mismo cliente que la búsqueda de staff).
  // La única policy RLS de `locals` (`locals_staff_access`) exige el GUC
  // `app.local_id`, que en esta ruta de lectura nunca se setea → el cliente de
  // sesión devolvía 0 filas sin error y el panel mostraba "Local no resuelto".
  // Además set_config(is_local: true) no sobrevive entre requests de PostgREST,
  // así que "setear el GUC primero" no es fiable aquí. Mismo rationale que
  // getLocalBySlug (src/lib/server/local.ts): el local es dato público del menú
  // y el service role corre solo en el servidor.
  if (!staff.location_id) {
    console.error(`getCurrentStaff/local_query: staff ${staff.id} sin location_id; el panel se muestra sin local.`);
    return { user, staff, local: null };
  }

  const { data: local, error: localError } = await adminSupabase
    .from('locals')
    .select('id, name, slug, timezone, iva_rate, delivery_fee, created_at, updated_at')
    .eq('id', staff.location_id)
    .maybeSingle();

  // Un fallo de consulta (red, 5xx, etc.) NO invalida la sesión: avisar y
  // degradar a "sin local" (la UI muestra el aviso amarillo) para reintento.
  if (localError) {
    console.error(`getCurrentStaff/local_query: ${describeSupabaseError(localError)}`);
  }

  return {
    user,
    staff,
    local: local ?? null,
  };
}

export default async function StaffDashboardPage() {
  await getCurrentStaff();

  // Redirigir siempre al panel de administración ya que no hay roles
  redirect('/staff/admin');
}