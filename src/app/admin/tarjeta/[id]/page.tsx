import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PrintButton } from '@/components/admin/print-button';
import { Logo } from '@/components/site/logo';
import { requireSession } from '@/server/auth/guard';
import { findOrderById } from '@/server/repositories/orders';

export const metadata: Metadata = { title: 'Tarjeta', robots: { index: false, follow: false } };

/**
 * The card that goes with the cake, ready to print: A6 (a quarter of an A4),
 * the message, who it is from — or nothing, for an anonymous surprise — and a
 * small Tartale mark.
 */
export default async function CardPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const order = await findOrderById(id);
  if (!order || order.erased) notFound();

  return (
    <main className="flex min-h-dvh flex-col items-center gap-6 bg-surface-sunken p-6 print:bg-white print:p-0">
      <style>{'@page { size: A6; margin: 0 } @media print { body { background: #fff } }'}</style>
      <div className="no-print flex items-center gap-3">
        <PrintButton />
        <p className="type-caption">A6 · 105 × 148 mm</p>
      </div>
      <article className="flex h-[148mm] w-[105mm] flex-col items-center justify-between bg-white px-[11mm] py-[13mm] text-center shadow-[var(--shadow-card)] print:shadow-none">
        <p className="font-display text-[1.05rem] italic text-ink-muted">Para {order.recipientName}</p>
        <p className="whitespace-pre-line text-balance font-display text-[1.4rem] leading-snug text-ink">{order.cardMessage || ' '}</p>
        <div className="flex flex-col items-center gap-4">
          {order.signOff ? <p className="font-display text-[1.1rem] text-ink">— {order.signOff}</p> : null}
          <div className="scale-75 opacity-70">
            <Logo />
          </div>
        </div>
      </article>
    </main>
  );
}
