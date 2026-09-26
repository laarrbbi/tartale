import { cn } from '@/lib/cn';

/** The mark: a cake seen from above, piped edge and a raspberry on top. */
export function CakeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('h-7 w-7', className)}>
      <circle cx="16" cy="16" r="15" fill="#f5e6d3" />
      <circle cx="16" cy="16" r="12.2" fill="#fffaf2" stroke="#2b1810" strokeWidth="1.6" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return <circle key={i} cx={(16 + 9.4 * Math.cos(a)).toFixed(2)} cy={(16 + 9.4 * Math.sin(a)).toFixed(2)} r="1.25" fill="#2b1810" />;
      })}
      <circle cx="16" cy="16" r="3.4" fill="#b02e55" />
    </svg>
  );
}

export function Logo({ className, inverse = false }: { className?: string; inverse?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <CakeMark />
      <span className={cn('font-display text-[1.35rem] font-semibold italic tracking-[-0.02em]', inverse ? 'text-ink-inverse' : 'text-ink')}>
        Tartale
      </span>
    </span>
  );
}
