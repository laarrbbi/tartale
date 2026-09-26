import Link from 'next/link';

import { ButtonLink } from '@/components/ui/button';

import { Logo } from './logo';

export function SiteHeader({ cta = true }: { cta?: boolean }) {
  return (
    <header className="chrome sticky top-0 z-40 border-b border-line/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Link href="/" aria-label="Tartale, inicio" className="pressable">
          <Logo />
        </Link>
        {cta ? (
          <ButtonLink href="/enviar" size="sm">
            Enviar una tarta
          </ButtonLink>
        ) : null}
      </div>
    </header>
  );
}
