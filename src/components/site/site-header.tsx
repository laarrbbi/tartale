import Link from 'next/link';

import { ButtonLink } from '@/components/ui/button';
import { hasCustomerCookie } from '@/server/auth/customer-session';
import { configuredProviders } from '@/server/auth/oidc';

import { Logo } from './logo';

/**
 * "Tu cuenta" for someone holding a session cookie (the page itself checks
 * it), "Entrar" once a way to sign in is switched on, nothing before that.
 * Neither asks the database: this header is on every page.
 */
async function accountLink(): Promise<{ href: string; label: string } | null> {
  if (await hasCustomerCookie()) return { href: '/cuenta', label: 'Tu cuenta' };
  if (configuredProviders().length > 0) return { href: '/entrar', label: 'Entrar' };
  return null;
}

export async function SiteHeader({ cta = true }: { cta?: boolean }) {
  const account = await accountLink();
  return (
    <header className="chrome sticky top-0 z-40 border-b border-line/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Link href="/" aria-label="Tartame, inicio" className="pressable">
          <Logo />
        </Link>
        <nav aria-label="Principal" className="flex items-center gap-1 sm:gap-3">
          <Link href="/zonas" className="hidden rounded-pill px-3 py-2 text-[0.875rem] font-medium text-ink-muted hover:text-ink sm:inline-flex">
            Dónde entregamos
          </Link>
          {account ? (
            <Link href={account.href} className="inline-flex rounded-pill px-3 py-2 text-[0.875rem] font-medium text-ink-muted hover:text-ink">
              {account.label}
            </Link>
          ) : null}
          {cta ? (
            <ButtonLink href="/enviar" size="sm">
              Enviar una tarta
            </ButtonLink>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
