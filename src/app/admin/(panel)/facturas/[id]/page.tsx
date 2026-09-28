import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CorrectInvoiceForm } from '@/components/admin/invoice-forms';
import { InvoiceSheet } from '@/components/invoice/invoice-sheet';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PrintButton } from '@/components/ui/print-button';
import { env } from '@/lib/env';
import { INVOICE_SERIES } from '@/lib/invoices';
import { requireOwner } from '@/server/auth/guard';
import { findInvoiceById, findOrderForInvoice, getOrderBilling } from '@/server/repositories/invoices';
import { loadInvoiceView } from '@/server/services/invoice-service';

export default async function InvoiceAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireOwner();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const invoice = await findInvoiceById(id);
  if (!invoice) notFound();
  const view = await loadInvoiceView(invoice);
  const orderIds = [...new Set(view.lines.map((l) => l.orderId).filter((o): o is number => o !== null))];
  const orders = (await Promise.all(orderIds.map((o) => findOrderForInvoice(o)))).filter((o) => o !== null);
  const isCurrent = invoice.series !== 'R' && orders.length > 0 && orders.every((o) => o.invoiceId === invoice.id);
  // What the customer left with the order, to start the correction from.
  const billing = orders.length === 1 ? await getOrderBilling(orders[0]!.id) : null;
  const related = [
    ...(view.rectifies ? [{ doc: view.rectifies, note: 'la que rectifica' }] : []),
    ...(view.replaces ? [{ doc: view.replaces, note: 'la que sustituye' }] : []),
    ...view.rectifications.map((doc) => ({ doc, note: doc.reason ?? 'rectificativa' })),
    ...(view.replacedBy ? [{ doc: view.replacedBy, note: 'la sustituye' }] : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <Link href="/admin/facturas" className="type-caption font-medium text-ink-muted hover:text-ink">
            ← Facturas
          </Link>
          <h1 className="type-display mt-2">{invoice.number}</h1>
          <p className="type-body mt-1 text-ink-muted">
            {INVOICE_SERIES[invoice.series].label}
            {orders.length > 0 ? ' · ' : ''}
            {orders.map((o, i) => (
              <span key={o.id}>
                {i > 0 ? ', ' : ''}
                <Link href={`/admin/pedidos/${o.id}`} className="text-brand underline underline-offset-2">
                  pedido nº {o.id}
                </Link>
              </span>
            ))}
          </p>
        </div>
        <PrintButton />
      </div>

      {related.length > 0 ? (
        <ul className="flex flex-wrap gap-2 print:hidden">
          {related.map(({ doc, note }) => (
            <li key={doc.id}>
              <Link href={`/admin/facturas/${doc.id}`} className="type-caption inline-flex rounded-pill bg-surface px-3.5 py-1.5 font-medium ring-1 ring-line-strong hover:bg-surface-sunken">
                {doc.number} · {note}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <InvoiceSheet view={view} />

      <Card className="print:hidden">
        <CardHeader title="Enlace para el cliente" description="Quien lo tenga puede verla e imprimirla. Está también en la página de su pedido." />
        <CardBody className="pt-2">
          <input
            readOnly
            aria-label="Enlace de la factura"
            value={`${env.APP_ORIGIN}/factura/${invoice.publicId}`}
            className="type-caption w-full rounded-field bg-surface-sunken px-3.5 py-2.5 font-mono text-ink"
          />
        </CardBody>
      </Card>

      {isCurrent ? (
        <Card className="print:hidden">
          <CardHeader
            title={invoice.series === 'S' ? 'Convertir en factura completa' : 'Corregir los datos del cliente'}
            description={
              invoice.series === 'S'
                ? 'Para quien la pida a nombre de su empresa: se emite una factura completa que sustituye a esta.'
                : 'Una factura emitida no se cambia: se emite una rectificativa que la anula y una nueva con los datos buenos.'
            }
          />
          <CardBody className="pt-2">
            <CorrectInvoiceForm
              invoiceId={invoice.id}
              simplified={invoice.series === 'S'}
              values={billing ?? { name: invoice.customerName ?? '', taxId: invoice.customerTaxId ?? '' }}
              csrfToken={session.csrfToken}
            />
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
