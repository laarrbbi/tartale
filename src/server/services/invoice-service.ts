import 'server-only';

import { cache } from 'react';

import { madridToday } from '@/lib/dates';
import { invoiceDate, invoiceNumber, withVat, type InvoiceSeries } from '@/lib/invoices';
import { SIZES, formatEuros } from '@/lib/orders';
import { getDb, type Db } from '@/server/db/pg';
import { recordAudit } from '@/server/repositories/audit';
import { getCompanyTax } from '@/server/repositories/birthdays';
import {
  findInvoiceById,
  findOrderForInvoice,
  findOrderForInvoiceByPublicId,
  findReplacement,
  getOrderBilling,
  insertInvoice,
  listInvoiceLines,
  listInvoicesForOrder,
  listOrdersAwaitingInvoice,
  listRectifications,
  lockOrdersForInvoice,
  netPerOrder,
  saveOrderBilling,
  setOrdersInvoice,
  takeInvoiceNumber,
  type BillingDetails,
  type Invoice,
  type InvoiceLine,
  type OrderForInvoice,
} from '@/server/repositories/invoices';
import { EMPTY_BUSINESS, getBusiness, type Business } from '@/server/repositories/settings';
import { randomToken } from '@/server/security/hash';

/**
 * Invoices, issued by the rules Spain sets for them:
 *
 * - Every paid web order gets one the moment it is paid: a factura completa
 *   (F) if the customer left their fiscal details, a simplificada (S) if not.
 * - A customer with an S can swap it for an F from their order's page: the F
 *   says which S it replaces (the canje of a simplified invoice).
 * - A refund, or a company order cancelled after being invoiced, gets a
 *   rectificativa (R) for the difference, pointing at the invoice it corrects.
 * - A mistake in the customer's details is corrected by an R that cancels the
 *   invoice and a new F with the right details.
 * - Company birthdays go on one F per company, for the orders the owner picks.
 *
 * Numbers are consecutive per series and year; an invoice is never changed or
 * deleted. Nothing is issued until Tartame's own details and the VAT rate are
 * filled in (Ajustes): the rate is the owner's figure, never a guess.
 *
 * Invoice lines never name the person who receives the cake: invoices are
 * kept for years, and the recipient's details go 90 days after delivery.
 */

export type Customer = BillingDetails;

/** What is missing before an invoice can be issued, as the Ajustes form calls it. */
export function invoicingGaps(business: Business): string[] {
  const gaps: string[] = [];
  if (!business.legalName) gaps.push('razón social');
  if (!business.taxId) gaps.push('NIF');
  if (!business.address || !business.postalCode || !business.city) gaps.push('dirección');
  if (business.vatRateBp === null) gaps.push('tipo de IVA');
  return gaps;
}

/**
 * Tartame's details for the legal pages and the footer. Before the database
 * update that adds them is applied, or if the database cannot be reached,
 * the pages still render, with the details marked as pending.
 */
export const businessDetails = cache(async (): Promise<Business> => {
  try {
    return await getBusiness();
  } catch {
    return EMPTY_BUSINESS;
  }
});

export function oneLineAddress(parts: { address: string | null; postalCode: string | null; city: string | null }): string | null {
  if (!parts.address) return null;
  const place = [parts.postalCode, parts.city].filter(Boolean).join(' ');
  return place ? `${parts.address}, ${place}` : parts.address;
}

/**
 * What an order should have invoiced right now: what was charged by card,
 * less refunds; for orders paid by transfer, their price unless cancelled.
 */
export function invoiceableCents(order: OrderForInvoice): number {
  if (order.paymentMethod === 'stripe') return Math.max(0, order.paidCents - order.refundedCents);
  return order.status === 'cancelado' ? 0 : Math.max(0, order.totalCents - order.refundedCents);
}

function cakeLabel(order: OrderForInvoice): string {
  return `Tarta ${order.cakeName}, ${SIZES[order.size].label.toLowerCase()}`;
}

/** One order as lines: the cake and the delivery, or one line when the amount is not the full price. */
export function orderLines(order: OrderForInvoice, cents: number, vatRateBp: number): DraftLine[] {
  const reference = `pedido ${order.id}, entrega el ${invoiceDate(order.deliverOn)}`;
  if (cents === order.priceCents + order.deliveryCents) {
    const lines: DraftLine[] = [
      { orderId: order.id, description: `${cakeLabel(order)} · ${reference}`, quantity: 1, vatRateBp, totalCents: order.priceCents },
    ];
    if (order.deliveryCents > 0) {
      lines.push({
        orderId: order.id,
        description: `Entrega en ${order.city} · pedido ${order.id}`,
        quantity: 1,
        vatRateBp,
        totalCents: order.deliveryCents,
      });
    }
    return lines;
  }
  return [
    { orderId: order.id, description: `${cakeLabel(order)} y entrega en ${order.city} · ${reference}`, quantity: 1, vatRateBp, totalCents: cents },
  ];
}

interface DraftLine {
  orderId: number | null;
  description: string;
  quantity: number;
  vatRateBp: number;
  /** VAT included. */
  totalCents: number;
}

interface Draft {
  series: InvoiceSeries;
  issuer: { name: string; taxId: string; address: string };
  customer: { name: string; taxId: string; address: string } | null;
  operationOn: string | null;
  replacesId?: number | null;
  rectifiesId?: number | null;
  reason?: string | null;
  companyId: number | null;
  paymentNote: string | null;
  createdBy: number | null;
  lines: DraftLine[];
}

function issuerOf(business: Business): Draft['issuer'] {
  return { name: business.legalName!, taxId: business.taxId!, address: oneLineAddress(business)! };
}

function customerOf(customer: Customer | null): Draft['customer'] {
  return customer ? { name: customer.name, taxId: customer.taxId, address: oneLineAddress(customer)! } : null;
}

/** The same customer as an earlier invoice (a rectificativa is addressed to whoever got the invoice it corrects). */
function customerFrom(invoice: Invoice): Draft['customer'] {
  return invoice.customerName && invoice.customerTaxId && invoice.customerAddress
    ? { name: invoice.customerName, taxId: invoice.customerTaxId, address: invoice.customerAddress }
    : null;
}

/** Tartame's details now, or those on the invoice being corrected if they have since been emptied. */
function issuerFor(business: Business, corrected: Invoice): Draft['issuer'] {
  return invoicingGaps(business).length === 0
    ? issuerOf(business)
    : { name: corrected.issuerName, taxId: corrected.issuerTaxId, address: corrected.issuerAddress };
}

/** Takes the next number and writes the invoice, in the caller's transaction. */
async function issue(tx: Db, draft: Draft): Promise<Invoice> {
  const issuedOn = madridToday();
  const year = Number(issuedOn.slice(0, 4));
  const seq = await takeInvoiceNumber(tx, draft.series, year);
  const { lines, breakdown } = withVat(draft.lines);
  const sum = (key: 'baseCents' | 'vatCents' | 'totalCents') => breakdown.reduce((total, b) => total + b[key], 0);
  return insertInvoice(tx, {
    publicId: randomToken(16),
    series: draft.series,
    year,
    seq,
    number: invoiceNumber(draft.series, year, seq),
    issuedOn,
    operationOn: draft.operationOn && draft.operationOn !== issuedOn ? draft.operationOn : null,
    issuerName: draft.issuer.name,
    issuerTaxId: draft.issuer.taxId,
    issuerAddress: draft.issuer.address,
    customerName: draft.customer?.name ?? null,
    customerTaxId: draft.customer?.taxId ?? null,
    customerAddress: draft.customer?.address ?? null,
    replacesId: draft.replacesId ?? null,
    rectifiesId: draft.rectifiesId ?? null,
    reason: draft.reason ?? null,
    companyId: draft.companyId,
    paymentNote: draft.paymentNote,
    baseCents: sum('baseCents'),
    vatCents: sum('vatCents'),
    totalCents: sum('totalCents'),
    createdBy: draft.createdBy,
    lines: lines.map((l) => ({
      orderId: l.orderId,
      description: l.description,
      quantity: l.quantity,
      vatRateBp: l.vatRateBp,
      baseCents: l.baseCents,
      vatCents: l.vatCents,
      totalCents: l.totalCents,
    })),
  });
}

/**
 * When the sale happened, if it is not the day of issue: the day a card
 * payment came in (it is paid in advance), or the delivery day of an order
 * paid by transfer. Several orders on one invoice carry their days in the lines.
 */
function operationDay(orders: readonly OrderForInvoice[]): string | null {
  if (orders.length !== 1) return null;
  const [order] = orders as [OrderForInvoice];
  return order.paymentMethod === 'stripe' ? order.paidOn : order.deliverOn;
}

function paymentNoteFor(orders: readonly OrderForInvoice[], business: Business): string | null {
  if (orders.every((o) => o.paymentMethod === 'stripe')) return 'Pagada con tarjeta.';
  return business.invoiceNote ?? 'Pago por transferencia.';
}

export type InvoiceFailure =
  | 'not_ready'
  | 'not_found'
  | 'invoiced'
  | 'nothing_to_invoice'
  | 'company_data'
  | 'not_eligible'
  | 'not_paid'
  | 'already_complete';

export type InvoiceResult = { ok: true; invoice: Invoice } | { ok: false; reason: InvoiceFailure };

const failed = (reason: InvoiceFailure): InvoiceResult => ({ ok: false, reason });

async function readyBusiness(): Promise<Business | null> {
  const business = await getBusiness();
  return invoicingGaps(business).length === 0 ? business : null;
}

/**
 * The invoice of one order: an F if its customer left fiscal details (or it
 * belongs to a company that has them), an S if not. Called when a card
 * payment comes in, and from the panel. Only ever one per order.
 */
export async function issueOrderInvoice(orderId: number, options: { actorId?: number | null } = {}): Promise<InvoiceResult> {
  const business = await readyBusiness();
  if (!business) return failed('not_ready');
  return getDb().transaction(async (tx): Promise<InvoiceResult> => {
    const [order] = await lockOrdersForInvoice(tx, [orderId]);
    if (!order) return failed('not_found');
    if (order.invoiceId !== null) return failed('invoiced');
    const cents = invoiceableCents(order);
    if (cents <= 0) return failed('nothing_to_invoice');
    const customer = (await getOrderBilling(order.id, tx)) ?? (order.companyId ? await getCompanyTax(order.companyId, tx) : null);
    const invoice = await issue(tx, {
      series: customer ? 'F' : 'S',
      issuer: issuerOf(business),
      customer: customerOf(customer),
      operationOn: operationDay([order]),
      companyId: order.companyId,
      paymentNote: paymentNoteFor([order], business),
      createdBy: options.actorId ?? null,
      lines: orderLines(order, cents, business.vatRateBp!),
    });
    await setOrdersInvoice(tx, [order.id], invoice.id);
    return { ok: true, invoice };
  });
}

/**
 * The F that takes the place of an S. With no refund on it, it is the canje:
 * the same lines, now with the customer's details, and a reference to the S.
 * With refunds, the S is cancelled by an R and a new F is issued for what is
 * left.
 */
async function replaceSimplified(tx: Db, simplified: Invoice, customer: Customer, business: Business, actorId: number | null): Promise<Invoice | null> {
  if ((await listRectifications(simplified.id, tx)).length > 0) {
    return reissue(tx, simplified, customer, business, actorId, 'Sustituida por una factura completa con los datos del cliente');
  }
  const lines = await listInvoiceLines(simplified.id, tx);
  const invoice = await issue(tx, {
    series: 'F',
    issuer: issuerOf(business),
    customer: customerOf(customer),
    operationOn: simplified.operationOn ?? simplified.issuedOn,
    replacesId: simplified.id,
    companyId: simplified.companyId,
    paymentNote: simplified.paymentNote,
    createdBy: actorId,
    lines: lines.map((l) => ({ orderId: l.orderId, description: l.description, quantity: l.quantity, vatRateBp: l.vatRateBp, totalCents: l.totalCents })),
  });
  const orderIds = [...new Set(lines.map((l) => l.orderId).filter((id): id is number => id !== null))];
  await setOrdersInvoice(tx, orderIds, invoice.id);
  return invoice;
}

/**
 * Cancels an invoice with an R for everything still invoiced on it, and
 * issues a new F for the same amounts with the right customer. Null, and
 * nothing issued, when it was all given back: there is nothing left to invoice.
 */
async function reissue(tx: Db, wrong: Invoice, customer: Customer, business: Business, actorId: number | null, reason: string): Promise<Invoice | null> {
  const net = await netPerOrder(tx, wrong.id);
  const orders = await lockOrdersForInvoice(tx, [...net.keys()]);
  const cancel: DraftLine[] = [];
  const again: DraftLine[] = [];
  for (const order of orders) {
    const { cents, vatRateBp } = net.get(order.id)!;
    if (cents === 0) continue;
    cancel.push({
      orderId: order.id,
      description: `Anulación: ${cakeLabel(order)} y entrega · pedido ${order.id}`,
      quantity: 1,
      vatRateBp,
      totalCents: -cents,
    });
    again.push(...orderLines(order, cents, vatRateBp));
  }
  if (cancel.length === 0) return null;
  await issue(tx, {
    series: 'R',
    issuer: issuerFor(business, wrong),
    customer: customerFrom(wrong),
    operationOn: null,
    rectifiesId: wrong.id,
    reason,
    companyId: wrong.companyId,
    paymentNote: null,
    createdBy: actorId,
    lines: cancel,
  });
  const invoice = await issue(tx, {
    series: 'F',
    issuer: issuerOf(business),
    customer: customerOf(customer),
    operationOn: wrong.operationOn ?? wrong.issuedOn,
    companyId: wrong.companyId,
    paymentNote: wrong.paymentNote,
    createdBy: actorId,
    lines: again,
  });
  await setOrdersInvoice(tx, orders.map((o) => o.id), invoice.id);
  return invoice;
}

/**
 * The customer's "I need it in my company's name", from their order's page.
 * Before the order is invoiced, the details are kept and the F is issued
 * with them; after, an S is swapped for an F. An F is not reissued this way:
 * a mistake in one is for us to correct.
 */
export type CompanyInvoiceRequest = { ok: true; invoice: Invoice | null } | { ok: false; reason: InvoiceFailure };

export async function requestCompanyInvoice(publicId: string, customer: Customer): Promise<CompanyInvoiceRequest> {
  const found = await findOrderForInvoiceByPublicId(publicId);
  if (!found || found.erased || found.paymentMethod !== 'stripe') return { ok: false, reason: 'not_found' };
  if (found.paidCents === 0) return { ok: false, reason: 'not_paid' };
  const business = await getBusiness();
  const ready = invoicingGaps(business).length === 0;

  return getDb().transaction(async (tx): Promise<CompanyInvoiceRequest> => {
    const [order] = await lockOrdersForInvoice(tx, [found.id]);
    if (!order) return { ok: false, reason: 'not_found' };
    if (order.invoiceId === null) {
      await saveOrderBilling(order.id, customer, tx);
      const cents = invoiceableCents(order);
      if (!ready || cents <= 0) return { ok: true, invoice: null };
      const invoice = await issue(tx, {
        series: 'F',
        issuer: issuerOf(business),
        customer: customerOf(customer),
        operationOn: operationDay([order]),
        companyId: null,
        paymentNote: paymentNoteFor([order], business),
        createdBy: null,
        lines: orderLines(order, cents, business.vatRateBp!),
      });
      await setOrdersInvoice(tx, [order.id], invoice.id);
      return { ok: true, invoice };
    }
    const current = await findInvoiceById(order.invoiceId, tx);
    if (!current || current.series !== 'S') return { ok: false, reason: 'already_complete' };
    if (!ready) return { ok: false, reason: 'not_ready' };
    const invoice = await replaceSimplified(tx, current, customer, business, null);
    if (!invoice) return { ok: false, reason: 'nothing_to_invoice' };
    await saveOrderBilling(order.id, customer, tx);
    return { ok: true, invoice };
  });
}

/**
 * The owner's correction of an invoice's customer (a wrong NIF, a new
 * address), or an S turned into an F for someone who asked by email.
 */
export async function correctInvoiceCustomer(invoiceId: number, customer: Customer, actorId: number): Promise<InvoiceResult> {
  const business = await readyBusiness();
  if (!business) return failed('not_ready');
  return getDb().transaction(async (tx): Promise<InvoiceResult> => {
    const invoice = await findInvoiceById(invoiceId, tx);
    if (!invoice) return failed('not_found');
    if (invoice.series === 'R') return failed('not_eligible');
    const lines = await listInvoiceLines(invoice.id, tx);
    const orderIds = [...new Set(lines.map((l) => l.orderId).filter((id): id is number => id !== null))];
    const orders = await lockOrdersForInvoice(tx, orderIds);
    // Only the invoice its orders point at now: not one already replaced or cancelled.
    if (orders.length === 0 || orders.some((o) => o.invoiceId !== invoice.id)) return failed('not_eligible');
    const fresh =
      invoice.series === 'S'
        ? await replaceSimplified(tx, invoice, customer, business, actorId)
        : await reissue(tx, invoice, customer, business, actorId, 'Corrección de los datos del cliente');
    return fresh ? { ok: true, invoice: fresh } : failed('nothing_to_invoice');
  });
}

/**
 * After a refund, or a company order cancelled once invoiced: an R for what
 * the order's invoice says beyond what the order now amounts to. Adds up what
 * is already rectified, so calling it again changes nothing.
 */
export async function rectifyOrder(orderId: number, options: { actorId?: number | null } = {}): Promise<Invoice | null> {
  return getDb().transaction(async (tx) => {
    const [order] = await lockOrdersForInvoice(tx, [orderId]);
    if (!order?.invoiceId) return null;
    const invoiced = (await netPerOrder(tx, order.invoiceId)).get(order.id);
    const excess = (invoiced?.cents ?? 0) - invoiceableCents(order);
    if (!invoiced || excess <= 0) return null;
    const current = (await findInvoiceById(order.invoiceId, tx))!;
    const cancelled = order.paymentMethod !== 'stripe' && order.status === 'cancelado';
    return issue(tx, {
      series: 'R',
      issuer: issuerFor(await getBusiness(tx), current),
      customer: customerFrom(current),
      operationOn: null,
      rectifiesId: current.id,
      reason: cancelled ? 'Pedido cancelado' : 'Devolución',
      companyId: current.companyId,
      paymentNote: null,
      createdBy: options.actorId ?? null,
      lines: [
        {
          orderId: order.id,
          description: `${cancelled ? 'Cancelación' : 'Devolución'}: ${cakeLabel(order)} y entrega · pedido ${order.id}`,
          quantity: 1,
          vatRateBp: invoiced.vatRateBp,
          totalCents: -excess,
        },
      ],
    });
  });
}

/** One F for a company's orders, to its fiscal details. */
export async function issueCompanyInvoice(companyId: number, orderIds: readonly number[], actorId: number): Promise<InvoiceResult> {
  const business = await readyBusiness();
  if (!business) return failed('not_ready');
  const tax = await getCompanyTax(companyId);
  if (!tax) return failed('company_data');
  const ids = [...new Set(orderIds)];
  if (ids.length === 0) return failed('nothing_to_invoice');
  return getDb().transaction(async (tx): Promise<InvoiceResult> => {
    const orders = await lockOrdersForInvoice(tx, ids);
    if (orders.length !== ids.length) return failed('not_found');
    if (orders.some((o) => o.companyId !== companyId || o.invoiceId !== null || invoiceableCents(o) <= 0)) {
      return failed('not_eligible');
    }
    const sorted = [...orders].sort((a, b) => a.deliverOn.localeCompare(b.deliverOn) || a.id - b.id);
    const invoice = await issue(tx, {
      series: 'F',
      issuer: issuerOf(business),
      customer: customerOf(tax),
      operationOn: operationDay(sorted),
      companyId,
      paymentNote: paymentNoteFor(sorted, business),
      createdBy: actorId,
      lines: sorted.flatMap((o) => orderLines(o, invoiceableCents(o), business.vatRateBp!)),
    });
    await setOrdersInvoice(tx, ids, invoice.id);
    return { ok: true, invoice };
  });
}

/** Invoices for every paid web order that has none yet. */
export async function issuePendingInvoices(actorId: number | null): Promise<{ issued: Invoice[]; failed: number }> {
  const issued: Invoice[] = [];
  let failures = 0;
  for (const id of await listOrdersAwaitingInvoice()) {
    try {
      const result = await issueOrderInvoice(id, { actorId });
      if (result.ok) issued.push(result.invoice);
      else if (result.reason === 'not_ready') break;
    } catch (error) {
      failures++;
      console.error('[invoices] could not invoice order', id, error instanceof Error ? error.message : error);
    }
  }
  return { issued, failed: failures };
}

/**
 * The hooks in payments: an invoice when a card payment comes in, an R when
 * money goes back. Never in the way of the payment itself: if invoicing is
 * not set up, or fails, the order is still paid or refunded, and the panel
 * lists it among the orders waiting for an invoice.
 */
export async function invoiceAfterPayment(orderId: number): Promise<void> {
  try {
    const result = await issueOrderInvoice(orderId);
    if (result.ok) await auditIssued(result.invoice, null, 'stripe');
  } catch (error) {
    console.error('[invoices] no invoice after payment', orderId, error instanceof Error ? error.message : error);
  }
}

export async function rectifyAfterChange(orderId: number, actor: { id: number | null; email: string | null }): Promise<void> {
  try {
    const invoice = await rectifyOrder(orderId, { actorId: actor.id });
    if (invoice) await auditIssued(invoice, actor.id, actor.email);
  } catch (error) {
    console.error('[invoices] no rectificativa', orderId, error instanceof Error ? error.message : error);
  }
}

export async function auditIssued(invoice: Invoice, actorId: number | null, actorEmail: string | null, ipHash?: string | null): Promise<void> {
  await recordAudit({
    actorId,
    actorEmail,
    action: 'invoice.issued',
    target: `invoice:${invoice.id}`,
    detail: `${invoice.number} · ${formatEuros(invoice.totalCents)}`,
    ipHash: ipHash ?? null,
  });
}

/** An invoice with what it prints and what points to it. */
export interface InvoiceView {
  invoice: Invoice;
  lines: InvoiceLine[];
  /** For an R: the invoice it corrects. */
  rectifies: Invoice | null;
  /** For an F issued in exchange for an S: that S. */
  replaces: Invoice | null;
  /** Later documents: its rectificativas, and the F that replaced it. */
  rectifications: Invoice[];
  replacedBy: Invoice | null;
}

export async function loadInvoiceView(invoice: Invoice): Promise<InvoiceView> {
  const [lines, rectifies, replaces, rectifications, replacedBy] = await Promise.all([
    listInvoiceLines(invoice.id),
    invoice.rectifiesId ? findInvoiceById(invoice.rectifiesId) : Promise.resolve(null),
    invoice.replacesId ? findInvoiceById(invoice.replacesId) : Promise.resolve(null),
    listRectifications(invoice.id),
    findReplacement(invoice.id),
  ]);
  return { invoice, lines, rectifies, replaces, rectifications, replacedBy };
}

/** An order's invoices, oldest first, which one is current, the details left for one, and what it amounts to now. */
export interface OrderInvoicing {
  invoices: Invoice[];
  current: Invoice | null;
  billing: BillingDetails | null;
  invoiceableCents: number;
}

export async function orderInvoicing(orderId: number): Promise<OrderInvoicing> {
  const [invoices, order, billing] = await Promise.all([
    listInvoicesForOrder(orderId),
    findOrderForInvoice(orderId),
    getOrderBilling(orderId),
  ]);
  return {
    invoices,
    current: invoices.find((i) => i.id === order?.invoiceId) ?? null,
    billing,
    invoiceableCents: order ? invoiceableCents(order) : 0,
  };
}
