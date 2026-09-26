import { cn } from '@/lib/cn';

export type Tone = 'neutral' | 'positive' | 'caution' | 'critical' | 'brand';

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-ink-muted',
  positive: 'bg-positive-soft text-positive',
  caution: 'bg-caution-soft text-caution',
  critical: 'bg-critical-soft text-critical',
  brand: 'bg-brand-soft text-brand',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-pill px-2.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.06em]',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
