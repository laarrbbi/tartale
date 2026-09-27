import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PrintButton } from '@/components/admin/print-button';
import { CardPreview } from '@/components/card/card-preview';
import { CARD_DESIGNS } from '@/lib/cards';
import { requireSession } from '@/server/auth/guard';
import { findOrderById } from '@/server/repositories/orders';

export const metadata: Metadata = { title: 'Tarjeta', robots: { index: false, follow: false } };

/**
 * The card that goes in the box, ready to print at A6 (a quarter of an A4),
 * in the design the sender chose. The same component draws it on the order
 * form, so what they saw is what gets printed.
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
      <div className="no-print flex flex-wrap items-center justify-center gap-3">
        <PrintButton />
        <p className="type-caption">
          A6 · 105 × 148 mm · diseño {CARD_DESIGNS[order.cardDesign].label.toLowerCase()} · pedido nº {order.id}
        </p>
      </div>
      <div className="w-[105mm] shadow-[var(--shadow-card)] print:shadow-none">
        <CardPreview design={order.cardDesign} message={order.cardMessage ?? ''} signOff={order.signOff} to={order.recipientName} placeholder=" " />
      </div>
    </main>
  );
}
