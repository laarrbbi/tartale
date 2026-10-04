import assert from 'node:assert/strict';
import test, { after, afterEach, before, beforeEach } from 'node:test';

import { addDays, madridToday, weekday } from '../src/lib/dates';
import { euros, toCsv } from '../src/lib/csv';
import { formatVatRate, invoiceNumber, invoicePeriod, parseVatRate, quarterOf, splitVat, withVat } from '../src/lib/invoices';
import { canDeleteOrder } from '../src/lib/orders';
import { isValidTaxId, normalizeTaxId, taxIdKind } from '../src/lib/tax-id';
import { getDb } from '../src/server/db/pg';
import { type StripeEvent } from '../src/server/payments/stripe';
import { insertCompany, saveCompanyTax } from '../src/server/repositories/birthdays';
import { listCakes } from '../src/server/repositories/catalog';
import {
  findInvoiceById,
  listInvoiceLines,
  listInvoicesForOrder,
  listRectifications,
  takeInvoiceNumber,
  vatSummary,
  type Invoice,
} from '../src/server/repositories/invoices';
import { deleteCancelledOrder, eraseOrder, findOrderById, findOrderByPublicId } from '../src/server/repositories/orders';
import { EMPTY_BUSINESS, saveBusiness, type Business } from '../src/server/repositories/settings';
import {
  correctInvoiceCustomer,
  invoicingGaps,
  issueCompanyInvoice,
  issueOrderInvoice,
  issuePendingInvoices,
  rectifyOrder,
  requestCompanyInvoice,
} from '../src/server/services/invoice-service';
import { placeOrder } from '../src/server/services/order-service';
import { handleStripeEvent, refundOrder } from '../src/server/services/payment-service';
import { orderInputSchema } from '../src/server/validation/schemas';

import { installFakeStripe, type FakeStripe } from './fake-stripe';
import { countRows, resetTestDb, sqlAll, sqlOne, sqlRun, startTestDb, stopTestDb } from './pg-harness';

let stripe: FakeStripe;
let ipSeq = 0;
const YEAR = Number(madridToday().slice(0, 4));

before(() => startTestDb());
beforeEach(async () => {
  await resetTestDb();
  stripe = installFakeStripe();
});
afterEach(() => stripe.restore());
after(stopTestDb);

const TARTAME: Business = {
  legalName: 'Tartame Ejemplo, S.L.',
  taxId: 'B12345674',
  address: 'Calle Mayor 1',
  postalCode: '03002',
  city: 'Alicante',
  email: 'hola@tartame.test',
  registry: null,
  // A test figure; in the app it is whatever the owner types.
  vatRateBp: 1000,
  invoiceNote: 'Transferencia a ES00 0000 0000 0000 0000 0000',
};

const ACME = { name: 'Acme Levante, S.L.', taxId: 'A58818501', address: 'Av. Óscar Esplá 2', postalCode: '03007', city: 'Alicante' };

function aWeekday(): string {
  let day = addDays(madridToday(), 3);
  while (weekday(day) === 0 || weekday(day) === 6) day = addDays(day, 1);
  return day;
}

function event(type: string, object: Record<string, unknown>): StripeEvent {
  return { id: `evt_${Math.random().toString(36).slice(2)}`, type, data: { object } };
}

/** A web order for Lotus mediana (46 €) + delivery (10 €), paid by card. */
async function aPaidOrder(extra: Record<string, unknown> = {}) {
  const cakeId = (await listCakes()).find((c) => c.name === 'Lotus')!.id;
  const placed = await placeOrder(
    orderInputSchema.parse({
      cakeId,
      size: 'mediana',
      occasion: 'cliente',
      recipientName: 'Marta Ruiz',
      recipientCompany: 'Fondo Mediterráneo',
      addressKind: 'oficina',
      address: 'Av. Maisonnave 11',
      postalCode: '03003',
      deliverOn: aWeekday(),
      timeSlot: 'tarde',
      senderName: 'Pablo Gil',
      senderPhone: '600123456',
      senderEmail: 'pablo@startup.test',
      recipientConsent: true,
      elapsedMs: 30_000,
      ...extra,
    }),
    `198.51.100.${++ipSeq}`,
  );
  assert.ok(placed.ok, JSON.stringify(placed));
  const order = (await findOrderByPublicId(placed.publicId))!;
  stripe.pay(order.stripeSessionId!);
  await handleStripeEvent(event('checkout.session.completed', stripe.sessions.get(order.stripeSessionId!)!));
  return (await findOrderByPublicId(placed.publicId))!;
}

async function currentInvoice(orderId: number): Promise<Invoice | null> {
  const row = await sqlOne<{ invoice_id: number | null }>('select invoice_id from orders where id = $1', [orderId]);
  return row?.invoice_id ? findInvoiceById(row.invoice_id) : null;
}

async function anOwner(): Promise<number> {
  return (await sqlOne<{ id: number }>(
    `insert into admin_users (email, password_hash, display_name, role) values ('owner@tartame.test', 'x', 'Owner', 'owner') returning id`,
  ))!.id;
}

/** An order made from the panel for a company, paid by transfer. */
async function aCompanyOrder(companyId: number, daysAhead = 5): Promise<number> {
  const row = await sqlOne<{ id: number }>(
    `insert into orders (public_id, source, payment_method, payment_status, status, occasion, bakery_id, cake_name, size,
       price_cents, delivery_cents, recipient_name, address_kind, address, postal_code, city, deliver_on, time_slot,
       company_id)
     values (substr(md5(random()::text), 1, 22), 'cumpleanos', 'transferencia', 'pendiente', 'confirmado', 'cumpleanos', 1,
       'Red Velvet', 'grande', 5200, 1000, 'Lucía Martínez', 'oficina', 'Av. Óscar Esplá 2', '03007', 'Alicante',
       $2::date, 'manana', $1)
     returning id`,
    [companyId, addDays(madridToday(), daysAhead)],
  );
  return row!.id;
}

// ---------------------------------------------------------------------------
// The pure parts
// ---------------------------------------------------------------------------

test('Spanish tax ids: DNI, NIE, companies and other entities, by their control character', () => {
  assert.equal(taxIdKind('12345678Z'), 'dni');
  assert.equal(taxIdKind('12345678A'), null);
  assert.equal(taxIdKind('X1234567L'), 'nie');
  assert.equal(taxIdKind('Y1234567X'), 'nie');
  assert.equal(taxIdKind('Z1234567R'), 'nie');
  assert.equal(taxIdKind('B12345674'), 'entidad');
  assert.equal(taxIdKind('B12345675'), null);
  assert.equal(taxIdKind('A58818501'), 'entidad');
  assert.equal(taxIdKind('Q2826000H'), 'entidad'); // a public body: ends in a letter
  assert.equal(taxIdKind('P12345674'), null, 'public bodies never end in a digit');
  assert.equal(taxIdKind('G1234567D'), 'entidad');
  assert.equal(taxIdKind('G12345674'), 'entidad', 'associations may use either');
  assert.equal(taxIdKind('K1234567L'), 'especial');
  assert.equal(taxIdKind('B1234567'), null);
  assert.equal(normalizeTaxId(' b-12.345.674 '), 'B12345674');
  assert.equal(isValidTaxId('b-12.345.674'), true);
});

test('VAT on prices that include it: the base rounded, the VAT what is left, so they always add up', () => {
  assert.deepEqual(splitVat(5600, 1000), { baseCents: 5091, vatCents: 509 });
  assert.deepEqual(splitVat(5600, 2100), { baseCents: 4628, vatCents: 972 });
  assert.deepEqual(splitVat(-5600, 1000), { baseCents: -5091, vatCents: -509 });
  assert.deepEqual(splitVat(1000, 0), { baseCents: 1000, vatCents: 0 });

  // Three lines of 1 € at 21 %: each rounds up, the sum does not. The lines
  // are adjusted by the odd cent so they match the invoice's total.
  const { lines, breakdown } = withVat([100, 100, 100].map((totalCents) => ({ totalCents, vatRateBp: 2100 })));
  assert.deepEqual(breakdown, [{ vatRateBp: 2100, baseCents: 248, vatCents: 52, totalCents: 300 }]);
  assert.equal(lines.reduce((s, l) => s + l.baseCents, 0), 248);
  for (const line of lines) assert.equal(line.baseCents + line.vatCents, line.totalCents);

  assert.equal(parseVatRate('10'), 1000);
  assert.equal(parseVatRate('10,5 %'), 1050);
  assert.equal(parseVatRate('0'), 0);
  assert.equal(parseVatRate('101'), null);
  assert.equal(parseVatRate('diez'), null);
  assert.equal(formatVatRate(1000), '10 %');
  assert.equal(formatVatRate(1050), '10,5 %');
  assert.equal(invoiceNumber('F', 2026, 7), 'F2026-0007');
  assert.equal(quarterOf('2026-09-28'), 3);
  assert.equal(quarterOf('2026-10-01'), 4);
});

// ---------------------------------------------------------------------------
// Issuing
// ---------------------------------------------------------------------------

test('nothing is issued until Tartame’s details and the VAT rate are set; then the orders waiting get theirs', async () => {
  assert.deepEqual(invoicingGaps(EMPTY_BUSINESS), ['razón social', 'NIF', 'dirección', 'tipo de IVA']);
  const order = await aPaidOrder();
  assert.equal(order.paymentStatus, 'pagado', 'the payment itself is never held up');
  assert.equal(await countRows('invoices'), 0);
  assert.deepEqual(await issueOrderInvoice(order.id), { ok: false, reason: 'not_ready' });

  await saveBusiness({ ...TARTAME, vatRateBp: null });
  assert.deepEqual(invoicingGaps({ ...TARTAME, vatRateBp: null }), ['tipo de IVA']);
  assert.equal((await issuePendingInvoices(null)).issued.length, 0);

  await saveBusiness(TARTAME);
  const run = await issuePendingInvoices(null);
  assert.equal(run.issued.length, 1);
  assert.equal(run.issued[0]!.number, `S${YEAR}-0001`);
  assert.equal((await issuePendingInvoices(null)).issued.length, 0, 'once');
});

test('a paid web order gets a factura simplificada at once: numbered, split into base and VAT, no one’s name on it', async () => {
  await saveBusiness(TARTAME);
  const order = await aPaidOrder();
  const invoice = (await currentInvoice(order.id))!;
  assert.equal(invoice.series, 'S');
  assert.equal(invoice.number, `S${YEAR}-0001`);
  assert.equal(invoice.issuedOn, madridToday());
  assert.equal(invoice.operationOn, null, 'paid today, issued today');
  assert.equal(invoice.issuerName, 'Tartame Ejemplo, S.L.');
  assert.equal(invoice.issuerTaxId, 'B12345674');
  assert.equal(invoice.issuerAddress, 'Calle Mayor 1, 03002 Alicante');
  assert.equal(invoice.customerName, null);
  assert.deepEqual([invoice.baseCents, invoice.vatCents, invoice.totalCents], [5091, 509, 5600]);
  assert.equal(invoice.paymentNote, 'Pagada con tarjeta.');
  assert.match(invoice.publicId, /^[A-Za-z0-9_-]{22}$/);

  const lines = await listInvoiceLines(invoice.id);
  assert.deepEqual(
    lines.map((l) => [l.totalCents, l.vatRateBp]),
    [
      [4600, 1000],
      [1000, 1000],
    ],
  );
  assert.match(lines[0]!.description, /^Tarta Lotus, mediana · pedido \d+, entrega el \d\d\/\d\d\/\d{4}$/);
  assert.equal(lines[1]!.description, `Entrega en Alicante · pedido ${order.id}`);
  // The person who gets the cake is never on an invoice: invoices outlive the 90 days.
  const text = JSON.stringify({ invoice, lines });
  assert.doesNotMatch(text, /Marta|Maisonnave|Fondo Mediterráneo|Pablo/);

  // The webhook again, or the return page: still one invoice.
  await handleStripeEvent(event('checkout.session.completed', stripe.sessions.get(order.stripeSessionId!)!));
  assert.equal(await countRows('invoices'), 1);
  assert.equal(await countRows('audit_log', `where action = 'invoice.issued'`), 1);
});

test('a customer who asks for it in the order gets a factura completa with their company’s details', async () => {
  await saveBusiness(TARTAME);
  const order = await aPaidOrder({
    wantsInvoice: true,
    billingName: '  Startup  Ejemplo, S.L. ',
    billingTaxId: 'b-12.345.674',
    billingAddress: 'Calle del Puerto 5',
    billingPostalCode: '03001',
    billingCity: 'Alicante',
  });
  const invoice = (await currentInvoice(order.id))!;
  assert.equal(invoice.number, `F${YEAR}-0001`);
  assert.equal(invoice.customerName, 'Startup Ejemplo, S.L.');
  assert.equal(invoice.customerTaxId, 'B12345674');
  assert.equal(invoice.customerAddress, 'Calle del Puerto 5, 03001 Alicante');
  assert.equal(await countRows('invoice_counters', `where series = 'S'`), 0, 'no simplificada taken');
});

test('the order form: fiscal details only when asked for, and a NIF that is not one is refused', async () => {
  const cakeId = (await listCakes())[0]!.id;
  const base = {
    cakeId,
    size: 'mediana',
    occasion: 'cliente',
    recipientName: 'Marta',
    addressKind: 'oficina',
    address: 'Av. Maisonnave 11',
    postalCode: '03003',
    deliverOn: aWeekday(),
    timeSlot: 'tarde',
    senderName: 'Pablo',
    senderPhone: '600123456',
    senderEmail: 'pablo@startup.test',
    recipientConsent: true,
    billingName: 'Startup, S.L.',
    billingTaxId: 'B12345675',
    billingAddress: 'Calle del Puerto 5',
    billingPostalCode: '03001',
    billingCity: 'Alicante',
  };
  assert.equal(orderInputSchema.parse(base).billing, null, 'the box unticked: nothing kept');
  const wrong = orderInputSchema.safeParse({ ...base, wantsInvoice: true });
  assert.equal(wrong.success, false);
  assert.deepEqual(
    wrong.error?.issues.map((i) => i.path.join('.')),
    ['billingTaxId'],
  );
  const missing = orderInputSchema.safeParse({ ...base, wantsInvoice: true, billingTaxId: 'B12345674', billingPostalCode: '301' });
  assert.deepEqual(missing.error?.issues.map((i) => i.path.join('.')), ['billingPostalCode']);
});

test('a simplificada swapped for a factura completa from the order’s page: it says which one it replaces', async () => {
  await saveBusiness(TARTAME);
  const order = await aPaidOrder();
  const simplified = (await currentInvoice(order.id))!;

  const swapped = await requestCompanyInvoice(order.publicId, ACME);
  assert.ok(swapped.ok && swapped.invoice);
  const complete = swapped.invoice;
  assert.equal(complete.series, 'F');
  assert.equal(complete.replacesId, simplified.id);
  assert.equal(complete.customerTaxId, 'A58818501');
  assert.equal(complete.totalCents, 5600);
  assert.equal(complete.operationOn, null, 'same day as the simplificada');
  assert.deepEqual(
    (await listInvoiceLines(complete.id)).map((l) => l.totalCents),
    (await listInvoiceLines(simplified.id)).map((l) => l.totalCents),
  );
  assert.equal((await currentInvoice(order.id))!.id, complete.id);
  assert.deepEqual(await findInvoiceById(simplified.id), simplified, 'the simplificada itself is untouched');
  assert.equal(await countRows('invoices', `where series = 'R'`), 0, 'a canje needs no rectificativa');
  // For the VAT return the sale counts once, with the simplificada.
  assert.deepEqual(await vatSummary(madridToday(), madridToday()), [{ vatRateBp: 1000, baseCents: 5091, vatCents: 509, totalCents: 5600 }]);

  assert.deepEqual(await requestCompanyInvoice(order.publicId, ACME), { ok: false, reason: 'already_complete' });
});

test('asked for before invoicing is set up: the details are kept, and the invoice comes out as an F', async () => {
  const order = await aPaidOrder();
  assert.deepEqual(await requestCompanyInvoice(order.publicId, ACME), { ok: true, invoice: null });
  await saveBusiness(TARTAME);
  const run = await issuePendingInvoices(null);
  assert.equal(run.issued[0]?.series, 'F');
  assert.equal(run.issued[0]?.customerName, 'Acme Levante, S.L.');
});

test('refunds: a rectificativa for each amount that goes back, pointing at the invoice; never twice', async () => {
  await saveBusiness(TARTAME);
  const order = await aPaidOrder();
  const simplified = (await currentInvoice(order.id))!;

  const part = await refundOrder(order.id, 1000);
  assert.ok(part.ok);
  let rects = await listRectifications(simplified.id);
  assert.equal(rects.length, 1);
  assert.equal(rects[0]!.number, `R${YEAR}-0001`);
  assert.equal(rects[0]!.reason, 'Devolución');
  assert.deepEqual([rects[0]!.baseCents, rects[0]!.vatCents, rects[0]!.totalCents], [-909, -91, -1000]);

  // The same refund reported by Stripe's webhook: already rectified.
  await handleStripeEvent(event('charge.refunded', { payment_intent: part.order.stripePaymentIntent, amount_refunded: 1000 }));
  assert.equal((await listRectifications(simplified.id)).length, 1);
  assert.equal(await rectifyOrder(order.id), null);

  // The rest, from Stripe's own dashboard.
  await handleStripeEvent(event('charge.refunded', { payment_intent: part.order.stripePaymentIntent, amount_refunded: 5600 }));
  rects = await listRectifications(simplified.id);
  assert.deepEqual(
    rects.map((r) => [r.number, r.totalCents]),
    [
      [`R${YEAR}-0001`, -1000],
      [`R${YEAR}-0002`, -4600],
    ],
  );
  const net = await sqlOne<{ total: number }>('select sum(total_cents)::int as total from invoice_lines where order_id = $1', [order.id]);
  assert.equal(net?.total, 0, 'all given back, nothing left invoiced');
});

test('a swap after a refund: the simplificada is cancelled by an R and the F is for what is left', async () => {
  await saveBusiness(TARTAME);
  const order = await aPaidOrder();
  const simplified = (await currentInvoice(order.id))!;
  await refundOrder(order.id, 1000);

  const swapped = await requestCompanyInvoice(order.publicId, ACME);
  assert.ok(swapped.ok && swapped.invoice);
  assert.equal(swapped.invoice.totalCents, 4600);
  assert.equal(swapped.invoice.replacesId, null);
  const rects = await listRectifications(simplified.id);
  assert.deepEqual(rects.map((r) => r.totalCents), [-1000, -4600]);
  const lines = await listInvoiceLines(swapped.invoice.id);
  assert.equal(lines.length, 1);
  assert.match(lines[0]!.description, /^Tarta Lotus, mediana y entrega en Alicante · pedido \d+/);

  // A later refund corrects the new F.
  await refundOrder(order.id, 600);
  assert.deepEqual((await listRectifications(swapped.invoice.id)).map((r) => r.totalCents), [-600]);
});

test('all given back: nothing left to put on a new invoice, and nothing is issued', async () => {
  await saveBusiness(TARTAME);
  const owner = await anOwner();
  const order = await aPaidOrder();
  const simplified = (await currentInvoice(order.id))!;
  await refundOrder(order.id, null);
  const before = await countRows('invoices');
  assert.deepEqual(await requestCompanyInvoice(order.publicId, ACME), { ok: false, reason: 'nothing_to_invoice' });
  assert.deepEqual(await correctInvoiceCustomer(simplified.id, ACME, owner), { ok: false, reason: 'nothing_to_invoice' });
  assert.equal(await countRows('invoices'), before);
  assert.equal(await countRows('order_billing'), 0);
});

test('the owner corrects a customer’s details: an R cancels the old F, a new F has the right ones', async () => {
  await saveBusiness(TARTAME);
  const owner = await anOwner();
  const order = await aPaidOrder({
    wantsInvoice: true,
    billingName: 'Startup, S.L.',
    billingTaxId: 'B12345674',
    billingAddress: 'Calle del Puerto 5',
    billingPostalCode: '03001',
    billingCity: 'Alicante',
  });
  const wrong = (await currentInvoice(order.id))!;
  const result = await correctInvoiceCustomer(wrong.id, ACME, owner);
  assert.ok(result.ok);
  assert.equal(result.invoice.number, `F${YEAR}-0002`);
  assert.equal(result.invoice.customerTaxId, 'A58818501');
  assert.equal(result.invoice.createdBy, owner);
  const [cancel] = await listRectifications(wrong.id);
  assert.equal(cancel?.totalCents, -5600);
  assert.equal(cancel?.customerTaxId, 'B12345674', 'the R goes to whoever got the invoice it cancels');
  assert.equal(cancel?.reason, 'Corrección de los datos del cliente');
  assert.equal((await currentInvoice(order.id))!.id, result.invoice.id);
  assert.deepEqual(await correctInvoiceCustomer(wrong.id, ACME, owner), { ok: false, reason: 'not_eligible' }, 'only the current one');
  assert.deepEqual(await correctInvoiceCustomer(cancel!.id, ACME, owner), { ok: false, reason: 'not_eligible' });
  assert.deepEqual((await listInvoicesForOrder(order.id)).map((i) => i.series), ['F', 'R', 'F']);
});

test('numbers: consecutive per series and year, and a failed invoice gives its number back', async () => {
  await assert.rejects(
    getDb().transaction(async (tx) => {
      assert.equal(await takeInvoiceNumber(tx, 'F', 2031), 1);
      throw new Error('the invoice could not be written');
    }),
  );
  await getDb().transaction(async (tx) => {
    assert.equal(await takeInvoiceNumber(tx, 'F', 2031), 1, 'no gap');
    assert.equal(await takeInvoiceNumber(tx, 'F', 2031), 2);
    assert.equal(await takeInvoiceNumber(tx, 'S', 2031), 1, 'each series its own');
    assert.equal(await takeInvoiceNumber(tx, 'F', 2032), 1, 'from 1 each year');
  });

  await saveBusiness(TARTAME);
  const orders = [await aPaidOrder(), await aPaidOrder(), await aPaidOrder()];
  const numbers = [];
  for (const o of orders) numbers.push((await currentInvoice(o.id))!.number);
  assert.deepEqual(numbers, [1, 2, 3].map((n) => invoiceNumber('S', YEAR, n)));
});

test('an invoice is final: the database refuses to change or delete it', async () => {
  await saveBusiness(TARTAME);
  const order = await aPaidOrder();
  const invoice = (await currentInvoice(order.id))!;
  await assert.rejects(sqlRun('update invoices set total_cents = 1, base_cents = 1, vat_cents = 0 where id = $1', [invoice.id]), /rectificativa/);
  await assert.rejects(sqlRun('update invoices set customer_name = $2 where id = $1', [invoice.id, 'Otro']), /rectificativa/);
  await assert.rejects(sqlRun('delete from invoices where id = $1', [invoice.id]), /rectificativa/);
  await assert.rejects(sqlRun('update invoice_lines set description = $2 where invoice_id = $1', [invoice.id, 'Otra cosa']), /rectificativa/);
  await assert.rejects(sqlRun('delete from invoice_lines where invoice_id = $1', [invoice.id]), /rectificativa/);
  assert.deepEqual(await findInvoiceById(invoice.id), invoice);
});

test('retention: the order’s people and fiscal details go at 90 days; the invoice keeps its copy; invoiced orders are never deleted', async () => {
  await saveBusiness(TARTAME);
  const order = await aPaidOrder({
    wantsInvoice: true,
    billingName: 'Startup, S.L.',
    billingTaxId: 'B12345674',
    billingAddress: 'Calle del Puerto 5',
    billingPostalCode: '03001',
    billingCity: 'Alicante',
  });
  assert.equal(await countRows('order_billing'), 1);
  assert.ok(await eraseOrder(order.id));
  assert.equal(await countRows('order_billing'), 0);
  const invoice = (await currentInvoice(order.id))!;
  assert.equal(invoice.customerName, 'Startup, S.L.', 'kept, as the law asks for invoices');

  // Cancelled and fully refunded, so no money is left in it; still invoiced, so it stays.
  await sqlRun(`update orders set status = 'cancelado', paid_cents = 0 where id = $1`, [order.id]);
  assert.equal(canDeleteOrder({ status: 'cancelado', paidCents: 0, refundedCents: 0, invoiced: true }), false);
  assert.equal(await deleteCancelledOrder(order.id), false);
  assert.ok(await findOrderById(order.id));
});

test('a company’s birthdays on one factura: its fiscal details, the orders it picks, an R if one is cancelled', async () => {
  await saveBusiness(TARTAME);
  const owner = await anOwner();
  const companyId = await insertCompany({
    name: 'Acme',
    contactName: 'Paula Ríos',
    contactPhone: '+34 600 000 111',
    contactEmail: null,
    billingNotes: null,
  });
  const first = await aCompanyOrder(companyId, 5);
  const second = await aCompanyOrder(companyId, 9);
  assert.deepEqual(await issueCompanyInvoice(companyId, [first, second], owner), { ok: false, reason: 'company_data' });

  await saveCompanyTax(companyId, ACME);
  const other = await insertCompany({ name: 'Otra', contactName: 'X', contactPhone: '600000000', contactEmail: null, billingNotes: null });
  const theirs = await aCompanyOrder(other);
  assert.deepEqual(await issueCompanyInvoice(companyId, [first, theirs], owner), { ok: false, reason: 'not_eligible' });

  const result = await issueCompanyInvoice(companyId, [second, first], owner);
  assert.ok(result.ok);
  const invoice = result.invoice;
  assert.equal(invoice.series, 'F');
  assert.equal(invoice.companyId, companyId);
  assert.equal(invoice.customerName, 'Acme Levante, S.L.');
  assert.equal(invoice.totalCents, 12400);
  assert.equal(invoice.paymentNote, TARTAME.invoiceNote);
  assert.equal(invoice.operationOn, null, 'several days: each line has its own');
  const lines = await listInvoiceLines(invoice.id);
  assert.deepEqual(
    lines.map((l) => [l.orderId, l.totalCents]),
    [
      [first, 5200],
      [first, 1000],
      [second, 5200],
      [second, 1000],
    ],
  );
  assert.doesNotMatch(JSON.stringify(lines), /Lucía/);
  assert.deepEqual(await issueCompanyInvoice(companyId, [first], owner), { ok: false, reason: 'not_eligible' }, 'already invoiced');

  // One of them is cancelled: its part is rectified, the other stays.
  await sqlRun(`update orders set status = 'cancelado' where id = $1`, [second]);
  const rect = await rectifyOrder(second, { actorId: owner });
  assert.equal(rect?.totalCents, -6200);
  assert.equal(rect?.reason, 'Pedido cancelado');
  assert.equal(rect?.customerTaxId, 'A58818501');
  assert.equal(await rectifyOrder(second), null);

  // The company can be deleted; its invoices stay, without the link.
  await sqlRun('delete from companies where id = $1', [companyId]);
  assert.equal((await findInvoiceById(invoice.id))?.companyId, null);
  assert.equal((await findInvoiceById(invoice.id))?.customerName, 'Acme Levante, S.L.');
});

test('the CSV for the accountant: semicolons, decimal commas, and a name can never run as a formula', () => {
  const csv = toCsv([
    ['Número', 'Cliente', 'Base'],
    ['F2026-0001', '=HYPERLINK("http://evil.test")', euros(5091)],
    ['R2026-0001', 'Acme; "Levante"', euros(-909)],
    ['S2026-0002', null, 0],
  ]);
  assert.equal(
    csv,
    '﻿Número;Cliente;Base\r\n' +
      `F2026-0001;"'=HYPERLINK(""http://evil.test"")";50,91\r\n` +
      'R2026-0001;"Acme; ""Levante""";-9,09\r\n' +
      'S2026-0002;;0\r\n',
  );
  assert.equal(toCsv([['-1 + 1', '@SUM(A1)', '+34 600']]), "﻿'-1 + 1;'@SUM(A1);'+34 600\r\n");
});

test('periods for the VAT returns: quarters and whole years, the current quarter by default', () => {
  assert.deepEqual(invoicePeriod('2026-3', '2026-09-28'), {
    year: 2026,
    quarter: 3,
    from: '2026-07-01',
    to: '2026-09-30',
    label: '3.º trimestre de 2026',
    key: '2026-3',
  });
  assert.equal(invoicePeriod('2026-1', '2026-09-28').to, '2026-03-31');
  assert.equal(invoicePeriod('2026-4', '2026-09-28').from, '2026-10-01');
  assert.deepEqual([invoicePeriod('2025', '2026-09-28').from, invoicePeriod('2025', '2026-09-28').to], ['2025-01-01', '2025-12-31']);
  assert.equal(invoicePeriod(undefined, '2026-11-02').key, '2026-4');
  assert.equal(invoicePeriod('nonsense', '2026-02-10').key, '2026-1');
});

test('the order’s page cannot ask for an invoice before paying, nor once the order is erased', async () => {
  await saveBusiness(TARTAME);
  const cakeId = (await listCakes()).find((c) => c.name === 'Lotus')!.id;
  const placed = await placeOrder(
    orderInputSchema.parse({
      cakeId,
      size: 'mediana',
      occasion: 'cliente',
      recipientName: 'Marta',
      addressKind: 'oficina',
      address: 'Av. Maisonnave 11',
      postalCode: '03003',
      deliverOn: aWeekday(),
      timeSlot: 'tarde',
      senderName: 'Pablo',
      senderPhone: '600123456',
      senderEmail: 'pablo@startup.test',
      recipientConsent: true,
      elapsedMs: 30_000,
    }),
    '198.51.100.250',
  );
  assert.ok(placed.ok);
  assert.deepEqual(await requestCompanyInvoice(placed.publicId, ACME), { ok: false, reason: 'not_paid' });
  assert.equal(await countRows('order_billing'), 0);

  const paid = await aPaidOrder();
  await eraseOrder(paid.id);
  assert.deepEqual(await requestCompanyInvoice(paid.publicId, ACME), { ok: false, reason: 'not_found' });
  assert.deepEqual(await requestCompanyInvoice('x'.repeat(22), ACME), { ok: false, reason: 'not_found' });
});
