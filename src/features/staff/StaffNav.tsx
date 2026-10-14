'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from './auth';
import { 
  Banknote, 
  ChefHat, 
  Settings, 
  LogOut, 
  UtensilsCrossed,
  Ban
} from 'lucide-react';
import { LocationSwitcher } from './LocationSwitcher';
import { ProductAvailabilityManager } from './ProductAvailabilityManager';

interface StaffNavProps {
  userEmail: string;
  locals?: Array<{ id: string; name: string; slug: string; is_open?: boolean }>;
  activeLocalId?: string;
  currentIsOpen?: boolean;
}

export function StaffNav({ userEmail, locals = [], activeLocalId = '', currentIsOpen = true }: StaffNavProps) {
  const pathname = usePathname();
  const [isAvailabilityOpen, setIsAvailabilityOpen] = useState(false);

  // CA-3.3: Atajo de teclado global Alt+8 para invocar el modo "86" instantáneamente
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === '8' || e.code === 'Digit8')) {
        e.preventDefault();
        setIsAvailabilityOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const links = [
    { href: '/staff/caja', label: 'Caja', icon: Banknote },
    { href: '/staff/kds', label: 'Cocina', icon: ChefHat },
    { href: '/staff/admin', label: 'Admin', icon: Settings },
  ];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  return (
    <header className="bg-zinc-950 text-white border-b border-zinc-800 sticky top-0 z-30 shadow-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-2.5">
        {/* Brand & Location Switcher */}
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          <Link href="/staff" className="flex items-center gap-2.5 font-bold text-sm sm:text-base group">
            <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center text-white shadow-md shadow-orange-600/20 group-hover:bg-orange-500 transition-colors">
              <UtensilsCrossed className="w-4 h-4" />
            </div>
            <span className="tracking-tight hidden sm:inline">Panel Staff</span>
          </Link>

          {locals.length > 0 && (
            <LocationSwitcher
              locals={locals}
              activeLocalId={activeLocalId}
              currentIsOpen={currentIsOpen}
            />
          )}
        </div>

        {/* Links operativos y usuario */}
        <div className="flex items-center gap-2 sm:gap-3">
          <nav className="flex items-center gap-1 sm:gap-1.5">
            {links.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all select-none active:scale-95 ${
                    active
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{link.label}</span>
                </Link>
              );
            })}

            {/* CA-3.3: Botón Agotados (86) accesible con atajo Alt+8 */}
            <button
              type="button"
              onClick={() => setIsAvailabilityOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all select-none active:scale-95 text-red-400 hover:text-red-300 hover:bg-red-950/40 border border-red-900/50"
              title="Agotados (86) - Atajo: Alt + 8"
            >
              <Ban className="w-4 h-4 text-red-500" />
              <span className="hidden sm:inline">Agotados (86)</span>
              <span className="sm:hidden">86</span>
            </button>
          </nav>

          {/* Usuario y Salir */}
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden md:inline text-xs text-zinc-400 font-mono max-w-[140px] truncate">
              {userEmail}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-800 active:scale-95 transition-all"
                title="Cerrar sesión"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Modal / Panel de disponibilidad 86 */}
      <ProductAvailabilityManager
        locationId={activeLocalId}
        isOpen={isAvailabilityOpen}
        onClose={() => setIsAvailabilityOpen(false)}
      />
    </header>
  );
}