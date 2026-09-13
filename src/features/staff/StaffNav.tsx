// src/features/staff/StaffNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from './auth';

export function StaffNav({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();

  const links = [
    { href: '/staff/caja', label: 'Caja' },
    { href: '/staff/kds', label: 'Cocina' },
    { href: '/staff/admin', label: 'Admin' },
  ];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  return (
    <header className="bg-gray-900 text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/staff" className="text-lg font-bold">
          Restaurant Staff
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-md px-3 py-1.5 transition ${
                isActive(link.href)
                  ? 'bg-orange-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <span className="ml-2 text-xs text-gray-400">{userEmail}</span>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-md bg-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-600 transition"
            >
              Salir
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}