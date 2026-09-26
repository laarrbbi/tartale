import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminNav, type NavItem } from '@/components/admin/admin-nav';
import { Logo } from '@/components/site/logo';
import { CSRF_FIELD } from '@/lib/constants';
import { logoutAction } from '@/server/actions/auth-actions';
import { requireSession } from '@/server/auth/guard';

export const metadata: Metadata = { title: 'Panel', robots: { index: false, follow: false } };

const STAFF_NAV: NavItem[] = [
  { href: '/admin', label: 'Pedidos' },
  { href: '/admin/pastelerias', label: 'Pastelerías' },
];

/**
 * Owner-only sections. Hiding them from staff is courtesy, not security:
 * every one of these pages and actions checks the role on the server.
 */
const OWNER_NAV: NavItem[] = [
  { href: '/admin/cumpleanos', label: 'Cumpleaños' },
  { href: '/admin/ajustes', label: 'Ajustes' },
  { href: '/admin/equipo', label: 'Equipo' },
  { href: '/admin/actividad', label: 'Actividad' },
];

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession({ allowPasswordChange: true });
  const items = [...STAFF_NAV, ...(session.user.role === 'owner' ? OWNER_NAV : []), { href: '/admin/cuenta', label: 'Cuenta' }];

  const logout = (
    <form action={logoutAction}>
      <input type="hidden" name={CSRF_FIELD} value={session.csrfToken} />
      <button type="submit" className="pressable rounded-pill px-3 py-1.5 text-[0.8125rem] font-medium text-ink-muted hover:text-ink">
        Salir
      </button>
    </form>
  );

  return (
    <div className="min-h-dvh bg-canvas lg:flex">
      <aside className="hidden shrink-0 border-r border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:flex-col">
        <div className="px-6 pb-5 pt-6">
          <Link href="/admin" aria-label="Pedidos">
            <Logo />
          </Link>
          <p className="type-caption mt-1">Panel del equipo</p>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-6">
          <AdminNav items={items} variant="sidebar" />
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line px-6 py-4">
          <p className="type-caption truncate">
            {session.user.displayName} · {session.user.role === 'owner' ? 'propietario' : 'equipo'}
          </p>
          {logout}
        </div>
      </aside>

      <header className="chrome sticky top-0 z-40 border-b border-line/70 lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 pt-3">
          <Link href="/admin" aria-label="Pedidos">
            <Logo />
          </Link>
          {logout}
        </div>
        <div className="px-4 pb-2.5 pt-2">
          <AdminNav items={items} variant="strip" />
        </div>
      </header>

      <main id="main" className="min-w-0 flex-1">
        <div className="mx-auto max-w-5xl px-4 py-7 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
