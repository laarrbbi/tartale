'use client';

import { buttonClasses } from './button';

/** The browser's own print dialog, which also saves as PDF. */
export function PrintButton({ label = 'Imprimir', variant = 'dark' }: { label?: string; variant?: 'dark' | 'secondary' }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={
        variant === 'dark'
          ? 'pressable rounded-pill bg-chocolate px-5 py-2.5 font-semibold text-ink-inverse'
          : buttonClasses('secondary', 'sm')
      }
    >
      {label}
    </button>
  );
}
