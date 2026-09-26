'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { cn } from '@/lib/cn';

export interface NavItem {
  href: string;
  label: string;
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin' || pathname.startsWith('/admin/pedidos');
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The panel's sections: a column on wide screens, a sideways strip on a phone. */
export function AdminNav({ items, variant }: { items: readonly NavItem[]; variant: 'sidebar' | 'strip' }) {
  const pathname = usePathname();
  const stripRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (variant !== 'strip') return;
    stripRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [pathname, variant]);

  if (variant === 'strip') {
    return (
      <nav ref={stripRef} aria-label="Secciones del panel" className="-mx-4 min-w-0 overflow-x-auto px-4 [scrollbar-width:none]">
        <ul className="flex gap-1">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'pressable inline-flex whitespace-nowrap rounded-pill px-3.5 py-1.5 text-[0.875rem] font-medium',
                    active ? 'bg-chocolate text-ink-inverse' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label="Secciones del panel">
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'pressable flex rounded-field px-3 py-2 text-[0.9375rem] font-medium',
                  active ? 'bg-chocolate text-ink-inverse' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
