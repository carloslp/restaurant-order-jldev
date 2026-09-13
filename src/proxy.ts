// src/proxy.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Proteger rutas del staff: redirigir a login si no hay cookies de sesión
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Staff routes
  if (pathname.startsWith('/staff') && !['/staff/login'].includes(pathname)) {
    const token =
      request.cookies.get('sb-access-token')?.value ||
      request.cookies.get('sb-refresh-token')?.value;

    if (!token) {
      const url = new URL('/staff/login', request.url);
      url.searchParams.set('callbackUrl', request.url);
      return NextResponse.redirect(url);
    }
  }

  // Guest/track routes could also be guarded, but they use tokens in params.
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Ajustar a lo necesario; por ahora proteger /staff
    '/staff/:path*',
  ],
};