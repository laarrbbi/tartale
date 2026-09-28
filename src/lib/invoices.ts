/**
 * Invoices, as a domain: series, numbers and the arithmetic of VAT on prices
 * that already include it. Pure, safe on the client and the server; the
 * issuing lives in server/services/invoice-service.ts.
 *
 * Three series, each numbered from 1 every year, without gaps:
 *  F  facturas completas, with the customer's name, NIF and address;
 *  S  facturas simplificadas, for people who did not ask for one;
 *  R  facturas rectificativas: refunds, and corrections (their own series,
 *     as the invoicing rules require).
 */

export const INVOICE_SERIES = {
  F: { label: 'Factura', plural: 'Facturas' },
  S: { label: 'Factura simplificada', plural: 'Facturas simplificadas' },
  R: { label: 'Factura rectificativa', plural: 'Rectificativas' },
} as const;
export type InvoiceSeries = keyof typeof INVOICE_SERIES;
export const INVOICE_SERIES_IDS = Object.keys(INVOICE_SERIES) as InvoiceSeries[];

/** F2026-0007. */
export function invoiceNumber(series: InvoiceSeries, year: number, seq: number): string {
  return `${series}${year}-${String(seq).padStart(4, '0')}`;
}

/** VAT rates are kept in basis points: 1000 = 10 %, 2100 = 21 %. */
export function formatVatRate(basisPoints: number): string {
  const percent = basisPoints / 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(2).replace(/0$/, '').replace('.', ',')} %`;
}

/** "10", "10 %", "10,5" → 1000, 1000, 1050. Null if it is not a rate between 0 and 100. */
export function parseVatRate(text: string): number | null {
  const clean = text.replace('%', '').trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(clean)) return null;
  const bp = Math.round(Number(clean) * 100);
  return bp >= 0 && bp <= 10000 ? bp : null;
}

/**
 * An amount with VAT included, split into base and VAT. The base is rounded
 * to the cent and the VAT is what is left, so the two always add up to what
 * the customer paid. Negative amounts (a refund) split symmetrically.
 */
export function splitVat(totalCents: number, rateBasisPoints: number): { baseCents: number; vatCents: number } {
  const sign = totalCents < 0 ? -1 : 1;
  const base = sign * Math.round((Math.abs(totalCents) * 10000) / (10000 + rateBasisPoints));
  return { baseCents: base, vatCents: totalCents - base };
}

export interface LineAmounts {
  totalCents: number;
  vatRateBp: number;
}

export interface VatBreakdown {
  vatRateBp: number;
  baseCents: number;
  vatCents: number;
  totalCents: number;
}

/**
 * Lines with VAT included → each line's base and VAT, and the breakdown by
 * rate that the invoice shows. The VAT is worked out once per rate on the
 * sum (so the invoice's figures are exact), and the lines' bases are
 * adjusted by the odd cent so they add up to it.
 */
export function withVat<T extends LineAmounts>(lines: readonly T[]): { lines: Array<T & { baseCents: number; vatCents: number }>; breakdown: VatBreakdown[] } {
  const out = lines.map((line) => ({ ...line, ...splitVat(line.totalCents, line.vatRateBp) }));
  const breakdown: VatBreakdown[] = [];
  for (const rate of [...new Set(lines.map((l) => l.vatRateBp))].sort((a, b) => a - b)) {
    const group = out.filter((l) => l.vatRateBp === rate);
    const totalCents = group.reduce((sum, l) => sum + l.totalCents, 0);
    const { baseCents, vatCents } = splitVat(totalCents, rate);
    const drift = baseCents - group.reduce((sum, l) => sum + l.baseCents, 0);
    if (drift !== 0) {
      const biggest = group.reduce((a, b) => (Math.abs(b.totalCents) > Math.abs(a.totalCents) ? b : a));
      biggest.baseCents += drift;
      biggest.vatCents -= drift;
    }
    breakdown.push({ vatRateBp: rate, baseCents, vatCents, totalCents });
  }
  return { lines: out, breakdown };
}

/** 2026-09-28 → 28/09/2026, the way invoices are dated in Spain. */
export function invoiceDate(isoDay: string): string {
  const [y, m, d] = isoDay.split('-');
  return `${d}/${m}/${y}`;
}

/** The quarter (1–4) of a YYYY-MM-DD day, for the VAT returns. */
export function quarterOf(isoDay: string): number {
  return Math.floor((Number(isoDay.slice(5, 7)) - 1) / 3) + 1;
}

export const INVOICE_LIMITS = {
  name: 120,
  address: 200,
  city: 80,
  note: 400,
  reason: 200,
} as const;

/** A quarter, or a whole year, as the days it covers: what the VAT returns ask about. */
export interface InvoicePeriod {
  year: number;
  quarter: number | null;
  from: string;
  to: string;
  label: string;
  /** For links: "2026-3", or "2026" for the year. */
  key: string;
}

const QUARTER_ENDS = ['03-31', '06-30', '09-30', '12-31'];

export function invoicePeriod(key: string | undefined, today: string): InvoicePeriod {
  const match = /^(\d{4})(?:-([1-4]))?$/.exec(key ?? '');
  const year = match ? Number(match[1]) : Number(today.slice(0, 4));
  const quarter = match ? (match[2] ? Number(match[2]) : null) : quarterOf(today);
  if (quarter === null) return { year, quarter, from: `${year}-01-01`, to: `${year}-12-31`, label: `Año ${year}`, key: String(year) };
  const startMonth = String((quarter - 1) * 3 + 1).padStart(2, '0');
  return {
    year,
    quarter,
    from: `${year}-${startMonth}-01`,
    to: `${year}-${QUARTER_ENDS[quarter - 1]}`,
    label: `${quarter}.º trimestre de ${year}`,
    key: `${year}-${quarter}`,
  };
}
