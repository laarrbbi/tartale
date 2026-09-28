import 'server-only';

import type { InvoiceSeries } from '@/lib/invoices';
import type { CakeSize, OrderStatus, PaymentMethod, PaymentStatus } from '@/lib/orders';
import { getDb, isoRequired, one, type Db } from '@/server/db/pg';

/**
 * Invoices and what they need from orders. An invoice is written once, in
 * the transaction that takes its number, and never changed afterwards (a
 * trigger in the database refuses it): corrections are new invoices.
 */
export interface Invoice {
  id: number;
  publicId: string;
  series: InvoiceSeries;
  year: number;
  seq: number;
  number: string;
  issuedOn: string;
  /** When the sale happened or was paid, if not the day of issue. */
  operationOn: string | null;
  issuerName: string;
  issuerTaxId: string;
  issuerAddress: string;
  customerName: string | null;
  customerTaxId: string | null;
  customerAddress: string | null;
  /** A factura completa issued in exchange for this simplificada. */
  replacesId: number | null;
  /** The invoice a rectificativa corrects. */
  rectifiesId: number | null;
  reason: string | null;
  companyId: number | null;
  paymentNote: string | null;
  baseCents: number;
  vatCents: number;
  totalCents: number;
  createdBy: number | null;
  createdAt: string;
}

export interface InvoiceLine {
  position: number;
  orderId: number | null;
  description: string;
  quantity: number;
  vatRateBp: number;
  baseCents: number;
  vatCents: number;
  totalCents: number;
}

interface InvoiceRow {
  id: number;
  public_id: string;
  series: InvoiceSeries;
  year: number;
  seq: number;
  number: string;
  issued_on: string;
  operation_on: string | null;
  issuer_name: string;
  issuer_tax_id: string;
  issuer_address: string;
  customer_name: string | null;
  customer_tax_id: string | null;
  customer_address: string | null;
  replaces_id: number | null;
  rectifies_id: number | null;
  reason: string | null;
  company_id: number | null;
  payment_note: string | null;
  base_cents: number;
  vat_cents: number;
  total_cents: number;
  created_by: number | null;
  created_at: Date;
}

const COLUMNS = `id, public_id, series, year, seq, number, issued_on, operation_on, issuer_name, issuer_tax_id,
  issuer_address, customer_name, customer_tax_id, customer_address, replaces_id, rectifies_id, reason, company_id,
  payment_note, base_cents, vat_cents, total_cents, created_by, created_at`;

function toInvoice(r: InvoiceRow): Invoice {
  return {
    id: r.id,
    publicId: r.public_id,
    series: r.series,
    year: r.year,
    seq: r.seq,
    number: r.number,
    issuedOn: r.issued_on,
    operationOn: r.operation_on,
    issuerName: r.issuer_name,
    issuerTaxId: r.issuer_tax_id,
    issuerAddress: r.issuer_address,
    customerName: r.customer_name,
    customerTaxId: r.customer_tax_id,
    customerAddress: r.customer_address,
    replacesId: r.replaces_id,
    rectifiesId: r.rectifies_id,
    reason: r.reason,
    companyId: r.company_id,
    paymentNote: r.payment_note,
    baseCents: r.base_cents,
    vatCents: r.vat_cents,
    totalCents: r.total_cents,
    createdBy: r.created_by,
    createdAt: isoRequired(r.created_at),
  };
}

interface LineRow {
  position: number;
  order_id: number | null;
  description: string;
  quantity: number;
  vat_rate_bp: number;
  base_cents: number;
  vat_cents: number;
  total_cents: number;
}

function toLine(r: LineRow): InvoiceLine {
  return {
    position: r.position,
    orderId: r.order_id,
    description: r.description,
    quantity: r.quantity,
    vatRateBp: r.vat_rate_bp,
    baseCents: r.base_cents,
    vatCents: r.vat_cents,
    totalCents: r.total_cents,
  };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * The next number of a series in a year. The counter row stays locked until
 * the transaction ends, so two invoices issued at once get consecutive
 * numbers, and a transaction that fails gives its number back: no gaps.
 */
export async function takeInvoiceNumber(tx: Db, series: InvoiceSeries, year: number): Promise<number> {
  const row = await one<{ last_seq: number }>(
    tx,
    `insert into invoice_counters (series, year, last_seq) values ($1, $2, 1)
     on conflict (series, year) do update set last_seq = invoice_counters.last_seq + 1
     returning last_seq`,
    [series, year],
  );
  return row!.last_seq;
}

export interface NewInvoice {
  publicId: string;
  series: InvoiceSeries;
  year: number;
  seq: number;
  number: string;
  issuedOn: string;
  operationOn: string | null;
  issuerName: string;
  issuerTaxId: string;
  issuerAddress: string;
  customerName: string | null;
  customerTaxId: string | null;
  customerAddress: string | null;
  replacesId: number | null;
  rectifiesId: number | null;
  reason: string | null;
  companyId: number | null;
  paymentNote: string | null;
  baseCents: number;
  vatCents: number;
  totalCents: number;
  createdBy: number | null;
  lines: readonly Omit<InvoiceLine, 'position'>[];
}

export async function insertInvoice(tx: Db, input: NewInvoice): Promise<Invoice> {
  const row = await one<InvoiceRow>(
    tx,
    `insert into invoices (public_id, series, year, seq, number, issued_on, operation_on, issuer_name, issuer_tax_id,
        issuer_address, customer_name, customer_tax_id, customer_address, replaces_id, rectifies_id, reason,
        company_id, payment_note, base_cents, vat_cents, total_cents, created_by)
     values ($1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
             $21, $22)
     returning ${COLUMNS}`,
    [
      input.publicId,
      input.series,
      input.year,
      input.seq,
      input.number,
      input.issuedOn,
      input.operationOn,
      input.issuerName,
      input.issuerTaxId,
      input.issuerAddress,
      input.customerName,
      input.customerTaxId,
      input.customerAddress,
      input.replacesId,
      input.rectifiesId,
      input.reason,
      input.companyId,
      input.paymentNote,
      input.baseCents,
      input.vatCents,
      input.totalCents,
      input.createdBy,
    ],
  );
  const invoice = toInvoice(row!);
  let position = 0;
  for (const line of input.lines) {
    position += 1;
    await tx.query(
      `insert into invoice_lines (invoice_id, position, order_id, description, quantity, vat_rate_bp, base_cents,
          vat_cents, total_cents)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [invoice.id, position, line.orderId, line.description, line.quantity, line.vatRateBp, line.baseCents, line.vatCents, line.totalCents],
    );
  }
  return invoice;
}

/** Points orders at the invoice that now covers them (what their links show). */
export async function setOrdersInvoice(tx: Db, orderIds: readonly number[], invoiceId: number): Promise<void> {
  await tx.query('update orders set invoice_id = $2, updated_at = now() where id = any($1::bigint[])', [orderIds, invoiceId]);
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function findInvoiceById(id: number, db: Db = getDb()): Promise<Invoice | null> {
  const row = await one<InvoiceRow>(db, `select ${COLUMNS} from invoices where id = $1`, [id]);
  return row ? toInvoice(row) : null;
}

export async function findInvoiceByPublicId(publicId: string): Promise<Invoice | null> {
  const row = await one<InvoiceRow>(getDb(), `select ${COLUMNS} from invoices where public_id = $1`, [publicId]);
  return row ? toInvoice(row) : null;
}

export async function findInvoicesByIds(ids: readonly number[]): Promise<Invoice[]> {
  if (ids.length === 0) return [];
  const { rows } = await getDb().query<InvoiceRow>(`select ${COLUMNS} from invoices where id = any($1::bigint[]) order by id`, [ids]);
  return rows.map(toInvoice);
}

export async function listInvoiceLines(invoiceId: number, db: Db = getDb()): Promise<InvoiceLine[]> {
  const { rows } = await db.query<LineRow>(
    `select position, order_id, description, quantity, vat_rate_bp, base_cents, vat_cents, total_cents
       from invoice_lines where invoice_id = $1 order by position`,
    [invoiceId],
  );
  return rows.map(toLine);
}

/** The rectificativas of an invoice, oldest first. */
export async function listRectifications(invoiceId: number, db: Db = getDb()): Promise<Invoice[]> {
  const { rows } = await db.query<InvoiceRow>(`select ${COLUMNS} from invoices where rectifies_id = $1 order by id`, [invoiceId]);
  return rows.map(toInvoice);
}

/** Of these invoices, the ones a factura completa has replaced. */
export async function listReplacedIds(ids: readonly number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const { rows } = await getDb().query<{ id: number }>(
    'select replaces_id as id from invoices where replaces_id = any($1::bigint[])',
    [ids],
  );
  return new Set(rows.map((r) => r.id));
}

/** The invoice issued in exchange for this one, if any. */
export async function findReplacement(invoiceId: number, db: Db = getDb()): Promise<Invoice | null> {
  const row = await one<InvoiceRow>(db, `select ${COLUMNS} from invoices where replaces_id = $1`, [invoiceId]);
  return row ? toInvoice(row) : null;
}

/** Every invoice with a line for this order, oldest first: its whole story. */
export async function listInvoicesForOrder(orderId: number): Promise<Invoice[]> {
  const { rows } = await getDb().query<InvoiceRow>(
    `select ${COLUMNS} from invoices
      where id in (select invoice_id from invoice_lines where order_id = $1)
      order by id`,
    [orderId],
  );
  return rows.map(toInvoice);
}

export async function listInvoicesForCompany(companyId: number): Promise<Invoice[]> {
  const { rows } = await getDb().query<InvoiceRow>(
    `select ${COLUMNS} from invoices where company_id = $1 order by id desc limit 200`,
    [companyId],
  );
  return rows.map(toInvoice);
}

/** The invoices issued between two days (both included), newest first. */
export async function listInvoices(options: { from: string; to: string; series?: InvoiceSeries | null }): Promise<Invoice[]> {
  const { rows } = await getDb().query<InvoiceRow>(
    `select ${COLUMNS} from invoices
      where issued_on between $1::date and $2::date and ($3::text is null or series = $3)
      order by issued_on desc, id desc`,
    [options.from, options.to, options.series ?? null],
  );
  return rows.map(toInvoice);
}

export interface VatSummaryRow {
  vatRateBp: number;
  baseCents: number;
  vatCents: number;
  totalCents: number;
}

/**
 * Base and VAT by rate for the invoices issued between two days: what the
 * quarterly return needs. A factura completa issued in exchange for a
 * simplificada is left out: that sale counted once already, with the
 * simplificada, in its own period — so a quarter's figures never change after
 * it is declared.
 */
export async function vatSummary(from: string, to: string): Promise<VatSummaryRow[]> {
  const { rows } = await getDb().query<{ vat_rate_bp: number; base_cents: number; vat_cents: number; total_cents: number }>(
    `select l.vat_rate_bp, sum(l.base_cents)::int as base_cents, sum(l.vat_cents)::int as vat_cents,
            sum(l.total_cents)::int as total_cents
       from invoice_lines l join invoices i on i.id = l.invoice_id
      where i.issued_on between $1::date and $2::date and i.replaces_id is null
      group by l.vat_rate_bp
      order by l.vat_rate_bp`,
    [from, to],
  );
  return rows.map((r) => ({ vatRateBp: r.vat_rate_bp, baseCents: r.base_cents, vatCents: r.vat_cents, totalCents: r.total_cents }));
}

/** One line of the register of issued invoices: an invoice and one of its VAT rates. */
export interface RegisterRow {
  number: string;
  series: InvoiceSeries;
  issuedOn: string;
  operationOn: string | null;
  customerName: string | null;
  customerTaxId: string | null;
  rectifiesNumber: string | null;
  replacesNumber: string | null;
  reason: string | null;
  vatRateBp: number;
  baseCents: number;
  vatCents: number;
  totalCents: number;
  orderIds: number[];
}

/** The invoices issued between two days, one row per invoice and VAT rate, in number order. */
export async function listInvoiceRegister(from: string, to: string): Promise<RegisterRow[]> {
  const { rows } = await getDb().query<{
    number: string;
    series: InvoiceSeries;
    issued_on: string;
    operation_on: string | null;
    customer_name: string | null;
    customer_tax_id: string | null;
    rectifies_number: string | null;
    replaces_number: string | null;
    reason: string | null;
    vat_rate_bp: number;
    base_cents: number;
    vat_cents: number;
    total_cents: number;
    order_ids: number[] | null;
  }>(
    `select i.number, i.series, i.issued_on, i.operation_on, i.customer_name, i.customer_tax_id,
            r.number as rectifies_number, s.number as replaces_number, i.reason, l.vat_rate_bp,
            sum(l.base_cents)::int as base_cents, sum(l.vat_cents)::int as vat_cents, sum(l.total_cents)::int as total_cents,
            array_agg(distinct l.order_id) filter (where l.order_id is not null) as order_ids
       from invoices i
       join invoice_lines l on l.invoice_id = i.id
       left join invoices r on r.id = i.rectifies_id
       left join invoices s on s.id = i.replaces_id
      where i.issued_on between $1::date and $2::date
      group by i.id, r.number, s.number, l.vat_rate_bp
      order by i.series, i.year, i.seq, l.vat_rate_bp`,
    [from, to],
  );
  return rows.map((r) => ({
    number: r.number,
    series: r.series,
    issuedOn: r.issued_on,
    operationOn: r.operation_on,
    customerName: r.customer_name,
    customerTaxId: r.customer_tax_id,
    rectifiesNumber: r.rectifies_number,
    replacesNumber: r.replaces_number,
    reason: r.reason,
    vatRateBp: r.vat_rate_bp,
    baseCents: r.base_cents,
    vatCents: r.vat_cents,
    totalCents: r.total_cents,
    orderIds: (r.order_ids ?? []).map(Number),
  }));
}

// ---------------------------------------------------------------------------
// Orders, as invoicing sees them
// ---------------------------------------------------------------------------

export interface OrderForInvoice {
  id: number;
  publicId: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  cakeName: string;
  size: CakeSize;
  priceCents: number;
  deliveryCents: number;
  totalCents: number;
  paidCents: number;
  refundedCents: number;
  city: string;
  deliverOn: string;
  /** The day it was paid, in Madrid; null if it has not been. */
  paidOn: string | null;
  companyId: number | null;
  invoiceId: number | null;
  erased: boolean;
}

interface OrderForInvoiceRow {
  id: number;
  public_id: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  cake_name: string;
  size: CakeSize;
  price_cents: number;
  delivery_cents: number;
  total_cents: number;
  paid_cents: number;
  refunded_cents: number;
  city: string;
  deliver_on: string;
  paid_on: string | null;
  company_id: number | null;
  invoice_id: number | null;
  erased: boolean;
}

const ORDER_COLUMNS = `id, public_id, status, payment_method, payment_status, cake_name, size, price_cents, delivery_cents,
  total_cents, paid_cents, refunded_cents, city, deliver_on,
  (paid_at at time zone 'Europe/Madrid')::date as paid_on, company_id, invoice_id, erased_at is not null as erased`;

function toOrderForInvoice(r: OrderForInvoiceRow): OrderForInvoice {
  return {
    id: r.id,
    publicId: r.public_id,
    status: r.status,
    paymentMethod: r.payment_method,
    paymentStatus: r.payment_status,
    cakeName: r.cake_name,
    size: r.size,
    priceCents: r.price_cents,
    deliveryCents: r.delivery_cents,
    totalCents: r.total_cents,
    paidCents: r.paid_cents,
    refundedCents: r.refunded_cents,
    city: r.city,
    deliverOn: r.deliver_on,
    paidOn: r.paid_on,
    companyId: r.company_id,
    invoiceId: r.invoice_id,
    erased: r.erased,
  };
}

/**
 * The orders, locked until the transaction ends: whoever invoices an order
 * first wins, and the other finds it invoiced. Locked in id order, so two
 * transactions over the same orders never wait on each other in a circle.
 */
export async function lockOrdersForInvoice(tx: Db, ids: readonly number[]): Promise<OrderForInvoice[]> {
  if (ids.length === 0) return [];
  const { rows } = await tx.query<OrderForInvoiceRow>(
    `select ${ORDER_COLUMNS} from orders where id = any($1::bigint[]) order by id for update`,
    [ids],
  );
  return rows.map(toOrderForInvoice);
}

export async function findOrderForInvoiceByPublicId(publicId: string): Promise<OrderForInvoice | null> {
  const row = await one<OrderForInvoiceRow>(getDb(), `select ${ORDER_COLUMNS} from orders where public_id = $1`, [publicId]);
  return row ? toOrderForInvoice(row) : null;
}

export async function findOrderForInvoice(id: number): Promise<OrderForInvoice | null> {
  const row = await one<OrderForInvoiceRow>(getDb(), `select ${ORDER_COLUMNS} from orders where id = $1`, [id]);
  return row ? toOrderForInvoice(row) : null;
}

/**
 * The orders an invoice covers, with their ids. Lines of the invoice and of
 * its rectificativas, added up per order: what is still invoiced for each.
 */
export async function netPerOrder(tx: Db, invoiceId: number): Promise<Map<number, { cents: number; vatRateBp: number }>> {
  const { rows } = await tx.query<{ order_id: number; cents: number; vat_rate_bp: number }>(
    `select l.order_id, sum(l.total_cents)::int as cents, max(l.vat_rate_bp) as vat_rate_bp
       from invoice_lines l join invoices i on i.id = l.invoice_id
      where (i.id = $1 or i.rectifies_id = $1) and l.order_id is not null
      group by l.order_id
      order by l.order_id`,
    [invoiceId],
  );
  return new Map(rows.map((r) => [r.order_id, { cents: r.cents, vatRateBp: r.vat_rate_bp }]));
}

/** True once any rectificativa has a line for the order. */
export async function orderWasRectified(orderId: number): Promise<boolean> {
  return (
    (await one(
      getDb(),
      `select 1 from invoice_lines l join invoices i on i.id = l.invoice_id where l.order_id = $1 and i.series = 'R' limit 1`,
      [orderId],
    )) !== null
  );
}

/** Paid web orders with no invoice yet (paid before invoicing was set up, or while it failed). */
export async function listOrdersAwaitingInvoice(limit = 500): Promise<number[]> {
  const { rows } = await getDb().query<{ id: number }>(
    `select id from orders
      where invoice_id is null and payment_method = 'stripe' and paid_cents > refunded_cents
      order by paid_at, id
      limit $1`,
    [limit],
  );
  return rows.map((r) => r.id);
}

export async function countOrdersAwaitingInvoice(): Promise<number> {
  const row = await one<{ c: number }>(
    getDb(),
    `select count(*)::int as c from orders
      where invoice_id is null and payment_method = 'stripe' and paid_cents > refunded_cents`,
  );
  return row?.c ?? 0;
}

/** A company's orders that can go on an invoice: not cancelled, not yet invoiced, oldest first. */
export async function listCompanyOrdersToInvoice(companyId: number): Promise<OrderForInvoice[]> {
  const { rows } = await getDb().query<OrderForInvoiceRow>(
    `select ${ORDER_COLUMNS} from orders
      where company_id = $1 and invoice_id is null and status <> 'cancelado'
      order by deliver_on, id
      limit 300`,
    [companyId],
  );
  return rows.map(toOrderForInvoice);
}

// ---------------------------------------------------------------------------
// The fiscal details a customer leaves with an order
// ---------------------------------------------------------------------------

export interface BillingDetails {
  name: string;
  taxId: string;
  address: string;
  postalCode: string;
  city: string;
}

export async function saveOrderBilling(orderId: number, billing: BillingDetails, db: Db = getDb()): Promise<void> {
  await db.query(
    `insert into order_billing (order_id, name, tax_id, address, postal_code, city) values ($1, $2, $3, $4, $5, $6)
     on conflict (order_id) do update
        set name = excluded.name, tax_id = excluded.tax_id, address = excluded.address,
            postal_code = excluded.postal_code, city = excluded.city, created_at = now()`,
    [orderId, billing.name, billing.taxId, billing.address, billing.postalCode, billing.city],
  );
}

export async function getOrderBilling(orderId: number, db: Db = getDb()): Promise<BillingDetails | null> {
  const row = await one<{ name: string; tax_id: string; address: string; postal_code: string; city: string }>(
    db,
    'select name, tax_id, address, postal_code, city from order_billing where order_id = $1',
    [orderId],
  );
  return row ? { name: row.name, taxId: row.tax_id, address: row.address, postalCode: row.postal_code, city: row.city } : null;
}
