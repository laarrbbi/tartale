import Link from 'next/link';

import { IssuePendingForm } from '@/components/admin/invoice-forms';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/stat';
import { cn } from '@/lib/cn';
import { madridToday } from '@/lib/dates';
import { plural } from '@/lib/format';
import { INVOICE_SERIES, formatVatRate, invoiceDate, invoicePeriod } from '@/lib/invoices';
import { formatEuros } from '@/lib/orders';
import { requireOwner } from '@/server/auth/guard';
import { countOrdersAwaitingInvoice, listInvoices, listReplacedIds, vatSummary } from '@/server/repositories/invoices';
import { businessDetails, invoicingGaps } from '@/server/services/invoice-service';
import { schemaStatus } from '@/server/services/schema-updates';

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const session = await requireOwner();
  const { t } = await searchParams;
  const today = madridToday();

  const updates = await schemaStatus();
  if (!updates.find((u) => u.id === '20260928120000_invoices')?.applied) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="type-display">Facturas</h1>
        <p className="type-body rounded-field bg-caution-soft px-4 py-3 text-caution">
          Esta versión necesita actualizar la base de datos para las facturas. Pulsa «Actualizar la base de datos» en{' '}
          <Link href="/admin/ajustes" className="font-semibold underline underline-offset-2">
            Ajustes
          </Link>
          .
        </p>
      </div>
    );
  }

  const period = invoicePeriod(t, today);
  const [business, invoices, summary, awaiting] = await Promise.all([
    businessDetails(),
    listInvoices({ from: period.from, to: period.to }),
    vatSummary(period.from, period.to),
    countOrdersAwaitingInvoice(),
  ]);
  const gaps = invoicingGaps(business);
  const replaced = await listReplacedIds(invoices.map((i) => i.id));
  const numberOf = new Map(invoices.map((i) => [i.id, i.number]));
  const totals = summary.reduce(
    (acc, r) => ({ base: acc.base + r.baseCents, vat: acc.vat + r.vatCents, total: acc.total + r.totalCents }),
    { base: 0, vat: 0, total: 0 },
  );
  const periods = [1, 2, 3, 4].map((q) => ({ key: `${period.year}-${q}`, label: `${q}T` })).concat({ key: String(period.year), label: 'Año' });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="type-display">Facturas</h1>
        <p className="type-body mt-1 max-w-prose text-pretty text-ink-muted">
          Cada pedido pagado con tarjeta recibe la suya al momento: simplificada, o completa si el cliente dejó sus datos. Una
          factura emitida no se cambia: se corrige con una rectificativa.
        </p>
      </div>

      {gaps.length > 0 ? (
        <p className="type-body rounded-field bg-caution-soft px-4 py-3 text-pretty text-caution">
          No se emite ninguna factura hasta completar en{' '}
          <Link href="/admin/ajustes" className="font-semibold underline underline-offset-2">
            Ajustes
          </Link>
          : {gaps.join(', ')}.
        </p>
      ) : null}

      {awaiting > 0 ? (
        <Card>
          <CardHeader
            title={`${plural(awaiting, 'pedido pagado', 'pedidos pagados')} sin factura`}
            description="Pagados antes de configurar las facturas, o cuando no se pudo emitir. Se emiten con la fecha de hoy y la del pago como fecha de la operación."
          />
          {gaps.length === 0 ? (
            <CardBody className="pt-2">
              <IssuePendingForm count={awaiting} csrfToken={session.csrfToken} />
            </CardBody>
          ) : null}
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Periodo" className="flex flex-wrap items-center gap-1.5">
          <Link href={`/admin/facturas?t=${period.year - 1}-4`} className="type-caption px-2 font-medium text-ink-muted hover:text-ink" aria-label={`${period.year - 1}`}>
            ← {period.year - 1}
          </Link>
          {periods.map((p) => (
            <Link
              key={p.key}
              href={`/admin/facturas?t=${p.key}`}
              aria-current={p.key === period.key ? 'page' : undefined}
              className={cn(
                'rounded-pill px-3.5 py-1.5 text-[0.8125rem] font-medium ring-1 ring-line-strong',
                p.key === period.key ? 'bg-chocolate text-ink-inverse ring-chocolate' : 'text-ink hover:bg-surface-sunken',
              )}
            >
              {p.label}
            </Link>
          ))}
          {period.year < Number(today.slice(0, 4)) ? (
            <Link href={`/admin/facturas?t=${period.year + 1}-1`} className="type-caption px-2 font-medium text-ink-muted hover:text-ink">
              {period.year + 1} →
            </Link>
          ) : null}
        </nav>
        <a
          href={`/api/admin/facturas?t=${period.key}`}
          className="type-caption rounded-pill px-3.5 py-1.5 font-medium text-ink ring-1 ring-line-strong hover:bg-surface-sunken"
          download
        >
          Descargar CSV
        </a>
      </div>

      <Card>
        <CardHeader
          title={period.label}
          description="Para el IVA del trimestre: base e IVA de las facturas, rectificativas restadas. Una completa que sustituye a una simplificada no suma: esa venta ya contó con la simplificada."
        />
        <CardBody className="pt-2">
          {summary.length === 0 ? (
            <p className="type-caption">Sin facturas en este periodo.</p>
          ) : (
            <table className="w-full text-[0.9375rem]">
              <thead>
                <tr className="type-caption text-left">
                  <th scope="col" className="pb-2 font-medium">IVA</th>
                  <th scope="col" className="pb-2 text-right font-medium">Base</th>
                  <th scope="col" className="pb-2 text-right font-medium">Cuota</th>
                  <th scope="col" className="pb-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {summary.map((r) => (
                  <tr key={r.vatRateBp}>
                    <td className="py-2">{formatVatRate(r.vatRateBp)}</td>
                    <td className="type-numeric py-2 text-right">{formatEuros(r.baseCents)}</td>
                    <td className="type-numeric py-2 text-right">{formatEuros(r.vatCents)}</td>
                    <td className="type-numeric py-2 text-right">{formatEuros(r.totalCents)}</td>
                  </tr>
                ))}
                {summary.length > 1 ? (
                  <tr className="font-semibold">
                    <td className="py-2">Total</td>
                    <td className="type-numeric py-2 text-right">{formatEuros(totals.base)}</td>
                    <td className="type-numeric py-2 text-right">{formatEuros(totals.vat)}</td>
                    <td className="type-numeric py-2 text-right">{formatEuros(totals.total)}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {invoices.length === 0 ? (
        <EmptyState title="Ninguna factura" description="Las facturas de este periodo aparecerán aquí." />
      ) : (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-card bg-surface ring-1 ring-line/70">
          {invoices.map((invoice) => (
            <li key={invoice.id}>
              <Link href={`/admin/facturas/${invoice.id}`} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 px-4 py-3 hover:bg-surface-sunken/60">
                <span className="type-body type-numeric w-32 shrink-0 font-semibold">{invoice.number}</span>
                <span className="type-caption type-numeric w-20 shrink-0">{invoiceDate(invoice.issuedOn)}</span>
                <span className="type-body min-w-0 flex-1 truncate">
                  {invoice.customerName ?? <span className="text-ink-muted">{INVOICE_SERIES[invoice.series].label}</span>}
                  {invoice.series === 'R' && invoice.reason ? <span className="type-caption"> · {invoice.reason}</span> : null}
                  {invoice.replacesId ? (
                    <span className="type-caption"> · sustituye a {numberOf.get(invoice.replacesId) ?? 'una simplificada'}, no suma</span>
                  ) : null}
                  {replaced.has(invoice.id) ? <span className="type-caption"> · sustituida</span> : null}
                </span>
                <span className={cn('type-body type-numeric shrink-0', invoice.totalCents < 0 && 'text-critical')}>
                  {formatEuros(invoice.totalCents)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="type-caption max-w-prose text-pretty">
        Las facturas se guardan aquí, sin borrarse nunca, y no se envían a Hacienda. Pregunta a tu gestoría si tienes que
        emitirlas con un programa de facturación verificable (VERI*FACTU) y desde cuándo.
      </p>
    </div>
  );
}
