import { euros, toCsv } from '@/lib/csv';
import { madridToday } from '@/lib/dates';
import { INVOICE_SERIES, invoiceDate, invoicePeriod } from '@/lib/invoices';
import { getSession } from '@/server/auth/session';
import { listInvoiceRegister } from '@/server/repositories/invoices';

export const dynamic = 'force-dynamic';

/**
 * The register of issued invoices for a quarter or a year, as a CSV for the
 * accountant: one row per invoice and VAT rate. The owner's only — it lists
 * customers' names and NIFs.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session || session.user.role !== 'owner' || session.user.mustChangePassword) {
    return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
  }
  const period = invoicePeriod(new URL(request.url).searchParams.get('t') ?? undefined, madridToday());
  const rows = await listInvoiceRegister(period.from, period.to);
  const csv = toCsv([
    [
      'Número',
      'Tipo',
      'Fecha',
      'Fecha de la operación',
      'Cliente',
      'NIF del cliente',
      'Base imponible',
      'Tipo de IVA (%)',
      'Cuota de IVA',
      'Total',
      'Rectifica a',
      'Motivo',
      'Sustituye a',
      'Suma en el IVA',
      'Pedidos',
    ],
    ...rows.map((r) => [
      r.number,
      INVOICE_SERIES[r.series].label,
      invoiceDate(r.issuedOn),
      r.operationOn ? invoiceDate(r.operationOn) : null,
      r.customerName,
      r.customerTaxId,
      euros(r.baseCents),
      r.vatRateBp / 100,
      euros(r.vatCents),
      euros(r.totalCents),
      r.rectifiesNumber,
      r.reason,
      r.replacesNumber,
      // A completa in exchange for a simplificada: that sale was counted with the simplificada.
      r.replacesNumber ? 'No' : 'Sí',
      r.orderIds.join(' '),
    ]),
  ]);
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="facturas-${period.key}.csv"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
