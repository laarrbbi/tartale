import { CakeMark } from '@/components/site/logo';
import { cn } from '@/lib/cn';
import { INVOICE_SERIES, formatVatRate, invoiceDate } from '@/lib/invoices';
import { formatEuros } from '@/lib/orders';
import type { InvoiceLine } from '@/server/repositories/invoices';
import type { InvoiceView } from '@/server/services/invoice-service';

function byRate(lines: readonly InvoiceLine[]) {
  const rates = new Map<number, { baseCents: number; vatCents: number }>();
  for (const line of lines) {
    const r = rates.get(line.vatRateBp) ?? { baseCents: 0, vatCents: 0 };
    r.baseCents += line.baseCents;
    r.vatCents += line.vatCents;
    rates.set(line.vatRateBp, r);
  }
  return [...rates].sort(([a], [b]) => a - b).map(([rate, sums]) => ({ rate, ...sums }));
}

/**
 * An invoice as a sheet of paper: on screen, and printed (or saved as PDF)
 * from the browser. Everything on it is what was stored when it was issued.
 */
export function InvoiceSheet({ view, className }: { view: InvoiceView; className?: string }) {
  const { invoice, lines, rectifies, replaces } = view;
  const rates = byRate(lines);
  const label = INVOICE_SERIES[invoice.series].label;
  const hasCustomer = Boolean(invoice.customerName);

  return (
    <article
      aria-label={`${label} ${invoice.number}`}
      className={cn(
        'invoice-sheet mx-auto w-full max-w-[52rem] bg-white px-5 py-7 text-[#1f1712] shadow-[var(--shadow-md)] ring-1 ring-line/70 sm:px-12 sm:py-12',
        'print:max-w-none print:p-0 print:shadow-none print:ring-0',
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
        <div className="flex items-center gap-2.5">
          <CakeMark className="h-9 w-9" />
          <span className="font-display text-[1.6rem] font-semibold italic tracking-[-0.02em]">Tartale</span>
        </div>
        <div className="sm:text-right">
          <p className="font-display text-[1.45rem] font-semibold leading-tight">{label}</p>
          <dl className="mt-2 grid grid-cols-[auto_auto] justify-start gap-x-4 gap-y-0.5 text-[0.875rem] sm:justify-end">
            <dt className="text-[#6b5a4e]">Número</dt>
            <dd className="font-semibold tabular-nums">{invoice.number}</dd>
            <dt className="text-[#6b5a4e]">Fecha</dt>
            <dd className="tabular-nums">{invoiceDate(invoice.issuedOn)}</dd>
            {invoice.operationOn ? (
              <>
                <dt className="text-[#6b5a4e]">Fecha de la operación</dt>
                <dd className="tabular-nums">{invoiceDate(invoice.operationOn)}</dd>
              </>
            ) : null}
          </dl>
        </div>
      </header>

      <div className={cn('mt-9 grid gap-6 text-[0.9375rem] leading-snug', hasCustomer && 'sm:grid-cols-2')}>
        <section>
          <h2 className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[#6b5a4e]">Emisor</h2>
          <p className="mt-1.5 font-semibold">{invoice.issuerName}</p>
          <p>NIF {invoice.issuerTaxId}</p>
          <p>{invoice.issuerAddress}</p>
        </section>
        {hasCustomer ? (
          <section>
            <h2 className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[#6b5a4e]">Cliente</h2>
            <p className="mt-1.5 font-semibold">{invoice.customerName}</p>
            <p>NIF {invoice.customerTaxId}</p>
            <p>{invoice.customerAddress}</p>
          </section>
        ) : null}
      </div>

      {rectifies ? (
        <p className="mt-7 invoice-rule border-l-2 pl-3 text-[0.9375rem]">
          Rectifica la factura {rectifies.number} del {invoiceDate(rectifies.issuedOn)}.
          {invoice.reason ? ` Motivo: ${invoice.reason}.` : ''}
        </p>
      ) : null}
      {replaces ? (
        <p className="mt-7 invoice-rule border-l-2 pl-3 text-[0.9375rem]">
          Sustituye a la factura simplificada {replaces.number} del {invoiceDate(replaces.issuedOn)}.
        </p>
      ) : null}

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-[0.875rem]">
          <thead>
            <tr className="invoice-rule border-b-2 text-left text-[0.75rem] uppercase tracking-[0.06em] text-[#6b5a4e]">
              <th scope="col" className="py-2 pr-3 font-semibold">Concepto</th>
              <th scope="col" className="py-2 px-2 text-right font-semibold">Cant.</th>
              <th scope="col" className="py-2 px-2 text-right font-semibold">Precio sin IVA</th>
              <th scope="col" className="py-2 px-2 text-right font-semibold">IVA</th>
              <th scope="col" className="py-2 pl-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.position} className="invoice-rule-soft border-b align-top">
                <td className="py-2.5 pr-3">{line.description}</td>
                <td className="py-2.5 px-2 text-right tabular-nums">{line.quantity}</td>
                <td className="py-2.5 px-2 text-right tabular-nums">{formatEuros(Math.round(line.baseCents / line.quantity))}</td>
                <td className="py-2.5 px-2 text-right tabular-nums">{formatVatRate(line.vatRateBp)}</td>
                <td className="py-2.5 pl-2 text-right tabular-nums">{formatEuros(line.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="ml-auto mt-6 flex w-full max-w-[20rem] flex-col gap-1 text-[0.9375rem]">
        {rates.map((r) => (
          <div key={r.rate} className="flex flex-col gap-1">
            <div className="flex justify-between gap-6">
              <dt className="text-[#6b5a4e]">Base imponible{rates.length > 1 ? ` al ${formatVatRate(r.rate)}` : ''}</dt>
              <dd className="tabular-nums">{formatEuros(r.baseCents)}</dd>
            </div>
            <div className="flex justify-between gap-6">
              <dt className="text-[#6b5a4e]">IVA {formatVatRate(r.rate)}</dt>
              <dd className="tabular-nums">{formatEuros(r.vatCents)}</dd>
            </div>
          </div>
        ))}
        <div className="invoice-rule mt-2 flex items-baseline justify-between gap-6 border-t-2 pt-2 font-semibold">
          <dt>Total</dt>
          <dd className="text-[1.125rem] tabular-nums">{formatEuros(invoice.totalCents)}</dd>
        </div>
      </dl>

      <footer className="invoice-rule-soft mt-10 flex flex-col gap-1 border-t pt-4 text-[0.8125rem] text-[#6b5a4e]">
        {invoice.series === 'S' ? <p>IVA incluido.</p> : null}
        {invoice.paymentNote ? <p className="whitespace-pre-line">{invoice.paymentNote}</p> : null}
      </footer>
    </article>
  );
}
