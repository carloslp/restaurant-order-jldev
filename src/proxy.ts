// src/proxy.ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Optimización de costos: No ejecutar auth.getUser() en rutas públicas ni estáticas.
  // Solo verificar sesión en rutas de staff protegidas o en la página de login.
  const isProtectedStaffRoute = pathname.startsWith('/staff') && !pathname.startsWith('/staff/auth');
  const isLoginPage = pathname === '/login';

  if (!isProtectedStaffRoute && !isLoginPage) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Importante: usar getUser() para revalidar el token con el servidor de auth
  // getSession() NO revalida y puede devolver sesión stale
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protección perimetral de rutas staff: interceptar antes de renderizar Server Components
  if (isProtectedStaffRoute) {
    if (!user) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('next', pathname);
      const redirectRes = NextResponse.redirect(loginUrl);
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectRes.cookies.set(cookie.name, cookie.value, cookie);
      });
      return redirectRes;
    }
  }

  // Si ya tiene sesión activa e intenta visitar /login, redirigir al panel
  if (isLoginPage && user) {
    const redirectRes = NextResponse.redirect(new URL('/staff', request.url));
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectRes.cookies.set(cookie.name, cookie.value, cookie);
    });
    return redirectRes;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};