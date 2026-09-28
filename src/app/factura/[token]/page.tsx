import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { InvoiceSheet } from '@/components/invoice/invoice-sheet';
import { PrintButton } from '@/components/ui/print-button';
import { INVOICE_SERIES } from '@/lib/invoices';
import { isPublicId } from '@/server/http/body';
import { findInvoiceByPublicId } from '@/server/repositories/invoices';
import { hashIp } from '@/server/security/hash';
import { ANONYMOUS_BUCKET, RULES, consume } from '@/server/security/rate-limit';
import { getClientIp } from '@/server/security/request';
import { loadInvoiceView } from '@/server/services/invoice-service';

export const metadata: Metadata = {
  title: 'Factura',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

/**
 * One invoice, for whoever has its link (it is on the order's page). Like
 * the tracking link, 22 random characters, never indexed or passed on.
 * Printed, or saved as PDF, from the browser.
 */
export default async function InvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isPublicId(token)) notFound();
  if (!(await consume(RULES.tracking, hashIp(await getClientIp()) ?? ANONYMOUS_BUCKET)).allowed) {
    return (
      <main id="main" className="mx-auto max-w-md px-5 py-24 text-center">
        <p className="type-title">Demasiadas visitas seguidas</p>
        <p className="type-body mt-2 text-ink-muted">Vuelve a abrir el enlace en unos minutos.</p>
      </main>
    );
  }
  const invoice = await findInvoiceByPublicId(token);
  if (!invoice) notFound();
  const view = await loadInvoiceView(invoice);
  const later = [...view.rectifications, ...(view.replacedBy ? [view.replacedBy] : [])];

  return (
    <main id="main" className="min-h-dvh bg-canvas px-4 pb-16 pt-6 sm:pt-10 print:bg-white print:p-0">
      <div className="mx-auto mb-5 flex max-w-[52rem] flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="type-caption text-pretty">Para guardarla en PDF, elige «Guardar como PDF» al imprimir.</p>
        <PrintButton label="Imprimir o guardar en PDF" />
      </div>
      {later.length > 0 ? (
        <div className="mx-auto mb-5 max-w-[52rem] rounded-field bg-caution-soft px-4 py-3 print:hidden">
          <p className="type-caption text-caution">
            {view.replacedBy ? 'Esta factura se ha sustituido. ' : 'Esta factura tiene rectificativas. '}
            {later.map((doc, i) => (
              <span key={doc.id}>
                {i > 0 ? ' · ' : ''}
                <Link href={`/factura/${doc.publicId}`} className="font-semibold underline underline-offset-2">
                  {INVOICE_SERIES[doc.series].label} {doc.number}
                </Link>
              </span>
            ))}
          </p>
        </div>
      ) : null}
      <InvoiceSheet view={view} />
    </main>
  );
}
