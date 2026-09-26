import assert from 'node:assert/strict';
import test, { after, afterEach, before, beforeEach } from 'node:test';

import { addDays, madridToday, weekday } from '../src/lib/dates';
import { env } from '../src/lib/env';
import { findCake, listCakes } from '../src/server/repositories/catalog';
import { findOrderByPublicId, getOrderPhoto } from '../src/server/repositories/orders';
import { saveSettings, DEFAULT_SETTINGS } from '../src/server/repositories/settings';
import { decodePhoto, placeOrder, retryPayment } from '../src/server/services/order-service';
import { orderInputSchema } from '../src/server/validation/schemas';

import { installFakeStripe, type FakeStripe } from './fake-stripe';
import { countRows, resetTestDb, sqlOne, sqlRun, startTestDb, stopTestDb } from './pg-harness';

let stripe: FakeStripe;
let ipSeq = 0;
const ip = () => `203.0.113.${(++ipSeq % 250) + 1}`;

before(() => startTestDb());
beforeEach(async () => {
  await resetTestDb();
  stripe = installFakeStripe();
});
afterEach(() => stripe.restore());
after(stopTestDb);

/** A weekday a few days out, so the tests never trip over the minimum notice. */
function aWeekday(from = 3): string {
  let day = addDays(madridToday(), from);
  while (weekday(day) === 0 || weekday(day) === 6) day = addDays(day, 1);
  return day;
}

async function lotusId(): Promise<number> {
  return (await listCakes()).find((c) => c.name === 'Lotus')!.id;
}

async function form(overrides: Record<string, unknown> = {}) {
  return orderInputSchema.parse({
    cakeId: await lotusId(),
    size: 'mediana',
    photo: null,
    cakeText: '¿Un café esta semana? ☕',
    allergies: '',
    occasion: 'inversor',
    recipientName: 'Marta Ruiz',
    recipientCompany: 'Fondo Mediterráneo',
    addressKind: 'oficina',
    address: 'Av. Maisonnave 11, 4ª planta',
    postalCode: '03003',
    deliveryNotes: 'Recepción',
    deliverOn: aWeekday(),
    timeSlot: 'manana',
    cardMessage: 'Nos encantaría contarte lo que estamos construyendo.',
    signOff: '',
    anonymous: false,
    recipientPhone: '',
    senderName: 'Pablo Gil',
    senderPhone: '600 123 456',
    senderEmail: 'Pablo@Startup.es',
    senderCompany: 'Startup SL',
    recipientConsent: true,
    marketingOptIn: false,
    website: '',
    elapsedMs: 45_000,
    ...overrides,
  });
}

test('an order is priced from the database, stored unpaid, and sent to Stripe for exactly that', async () => {
  const placed = await placeOrder(await form(), ip());
  assert.ok(placed.ok, JSON.stringify(placed));
  assert.match(placed.publicId, /^[A-Za-z0-9_-]{22}$/);
  assert.match(placed.paymentUrl, /^https:\/\/checkout\.stripe\.test\//);

  const order = await findOrderByPublicId(placed.publicId);
  assert.equal(order?.status, 'nuevo');
  assert.equal(order?.paymentStatus, 'pendiente');
  assert.equal(order?.priceCents, 4600); // Lotus, mediana, from the seed
  assert.equal(order?.deliveryCents, 1000); // the Alicante zone
  assert.equal(order?.totalCents, 5600);
  assert.equal(order?.signOff, 'Pablo Gil'); // signed with the sender's name when left empty
  assert.equal(order?.senderEmail, 'pablo@startup.es');
  assert.equal(order?.city, 'Alicante');
  assert.equal(order?.stripeSessionId, 'cs_test_1');

  const call = stripe.requests.find((r) => r.path === '/checkout/sessions')!;
  assert.equal(call.params.get('line_items[0][price_data][unit_amount]'), '4600');
  assert.equal(call.params.get('line_items[1][price_data][unit_amount]'), '1000');
  assert.equal(call.params.get('line_items[0][price_data][currency]'), 'eur');
  assert.equal(call.params.get('metadata[order_id]'), String(order?.id));
  assert.equal(call.params.get('customer_email'), 'pablo@startup.es');
  assert.equal(call.params.get('success_url'), `https://tartale.test/pedido/${placed.publicId}?pago=ok&session_id={CHECKOUT_SESSION_ID}`);
  assert.ok(call.headers['idempotency-key']?.startsWith(`checkout-${order?.id}-`));
  // Nothing about marketing unless ticked.
  assert.equal(await countRows('marketing_contacts'), 0);
});

test('the browser cannot choose the price: there is no price in the form at all', async () => {
  const parsed = orderInputSchema.parse({ ...(await form()), priceCents: 1, deliveryCents: 0 });
  assert.equal('priceCents' in parsed, false);
  const placed = await placeOrder(parsed, ip());
  assert.ok(placed.ok);
  assert.equal((await findOrderByPublicId(placed.publicId))?.totalCents, 5600);
});

test('anonymous: the card carries no name, whatever was typed', async () => {
  const placed = await placeOrder(await form({ anonymous: true, signOff: 'Pablo' }), ip());
  assert.ok(placed.ok);
  const order = await findOrderByPublicId(placed.publicId);
  assert.equal(order?.signOff, null);
  assert.equal(order?.anonymous, true);
});

test('news by email only with the box ticked, stored apart from the order', async () => {
  const placed = await placeOrder(await form({ marketingOptIn: true }), ip());
  assert.ok(placed.ok);
  const contact = await sqlOne<{ email: string; consent_text: string }>('select email, consent_text from marketing_contacts');
  assert.equal(contact?.email, 'pablo@startup.es');
  assert.match(contact?.consent_text ?? '', /novedades/);
});

test('refused: outside the zone, too soon, too far, a closed weekday, or switched off — and nothing is stored', async () => {
  assert.deepEqual(await placeOrder(await form({ postalCode: '28001' }), ip()), { ok: false, reason: 'zone', field: 'postalCode' });
  assert.deepEqual(await placeOrder(await form({ deliverOn: madridToday() }), ip()), { ok: false, reason: 'too_soon', field: 'deliverOn' });
  assert.deepEqual(await placeOrder(await form({ deliverOn: addDays(madridToday(), 400) }), ip()), {
    ok: false,
    reason: 'too_far',
    field: 'deliverOn',
  });
  const day = aWeekday();
  await saveSettings({ ...DEFAULT_SETTINGS, closedWeekdays: [weekday(day)] });
  assert.deepEqual(await placeOrder(await form({ deliverOn: day }), ip()), { ok: false, reason: 'closed_day', field: 'deliverOn' });
  await saveSettings({ ...DEFAULT_SETTINGS, ordersEnabled: false });
  assert.deepEqual(await placeOrder(await form(), ip()), { ok: false, reason: 'closed' });
  assert.equal(await countRows('orders'), 0);
  assert.equal(stripe.requests.length, 0);
});

test('refused: a cake from another bakery, an inactive one, or a size it does not come in', async () => {
  const lotus = (await findCake(await lotusId()))!;
  await sqlRun(`insert into bakeries (slug, name, city) values ('otra', 'Otra', 'Elche')`);
  await sqlRun(`insert into cakes (bakery_id, name, price_pequena_cents) values (2, 'Tarta de Elche', 2000)`);
  assert.deepEqual(await placeOrder(await form({ cakeId: 9 }), ip()), { ok: false, reason: 'cake', field: 'cakeId' });
  await sqlRun('update cakes set price_grande_cents = null where id = $1', [lotus.id]);
  assert.deepEqual(await placeOrder(await form({ size: 'grande' }), ip()), { ok: false, reason: 'size', field: 'size' });
  await sqlRun('update cakes set active = false where id = $1', [lotus.id]);
  assert.deepEqual(await placeOrder(await form(), ip()), { ok: false, reason: 'cake', field: 'cakeId' });
  assert.equal(await countRows('orders'), 0);
});

test('bots: a filled honeypot or a form filled in seconds is refused without saying why', async () => {
  assert.deepEqual(await placeOrder(await form({ website: 'https://spam.example' }), ip()), { ok: false, reason: 'rejected' });
  assert.deepEqual(await placeOrder(await form({ elapsedMs: 1200 }), ip()), { ok: false, reason: 'rejected' });
  assert.deepEqual(await placeOrder(await form({ elapsedMs: undefined }), ip()), { ok: false, reason: 'rejected' });
  assert.equal(await countRows('orders'), 0);
});

test('rate limit: the ninth order from one connection in ten minutes is refused', async () => {
  const same = '198.51.100.7';
  for (let i = 0; i < 8; i++) assert.ok((await placeOrder(await form(), same)).ok);
  assert.deepEqual(await placeOrder(await form(), same), { ok: false, reason: 'rate_limited' });
});

test('the photo: only real image bytes are kept, and only where the bakery prints', async () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 7)]);
  const placed = await placeOrder(await form({ photo: `data:image/jpeg;base64,${jpeg.toString('base64')}` }), ip());
  assert.ok(placed.ok);
  const order = await findOrderByPublicId(placed.publicId);
  assert.equal(order?.hasPhoto, true);
  const photo = await getOrderPhoto(order!.id);
  assert.equal(photo?.mime, 'image/jpeg');
  assert.equal(photo?.bytes.length, jpeg.length);

  // An HTML page dressed up as a PNG.
  const html = Buffer.from(`<html><script>alert(1)</script>${' '.repeat(200)}</html>`).toString('base64');
  assert.deepEqual(await placeOrder(await form({ photo: `data:image/png;base64,${html}` }), ip()), {
    ok: false,
    reason: 'photo',
    field: 'photo',
  });
  // Too big once decoded.
  assert.equal(decodePhoto(`data:image/jpeg;base64,${Buffer.concat([jpeg, Buffer.alloc(1_600_000)]).toString('base64')}`), null);
  // Not a data URL at all.
  assert.equal(decodePhoto('https://evil.example/x.jpg'), null);
  // A PNG and a WebP are recognised by their signatures.
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200)]);
  assert.equal(decodePhoto(`data:image/png;base64,${png.toString('base64')}`)?.mime, 'image/png');
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(200)]);
  assert.equal(decodePhoto(`data:image/webp;base64,${webp.toString('base64')}`)?.mime, 'image/webp');

  await sqlRun('update bakeries set prints_photos = false');
  assert.deepEqual(await placeOrder(await form({ photo: `data:image/jpeg;base64,${jpeg.toString('base64')}` }), ip()), {
    ok: false,
    reason: 'no_photo',
    field: 'photo',
  });
});

test('when Stripe cannot open the payment page, no order is left behind', async () => {
  stripe.failWith = 503;
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 7)]);
  assert.deepEqual(await placeOrder(await form({ photo: `data:image/jpeg;base64,${jpeg.toString('base64')}` }), ip()), {
    ok: false,
    reason: 'payment_unavailable',
  });
  assert.equal(await countRows('orders'), 0);
  assert.equal(await countRows('order_photos'), 0);
});

test('without a Stripe key the shop takes no orders', async () => {
  const key = env.STRIPE_SECRET_KEY;
  (env as { STRIPE_SECRET_KEY: string }).STRIPE_SECRET_KEY = '';
  try {
    assert.deepEqual(await placeOrder(await form(), ip()), { ok: false, reason: 'payments_off' });
  } finally {
    (env as { STRIPE_SECRET_KEY: string }).STRIPE_SECRET_KEY = key;
  }
});

test('paying later from the tracking link opens a fresh page, but not for a day that can no longer be met', async () => {
  const placed = await placeOrder(await form(), ip());
  assert.ok(placed.ok);
  const again = await retryPayment(placed.publicId, ip());
  assert.ok(again.ok);
  assert.equal((await findOrderByPublicId(placed.publicId))?.stripeSessionId, 'cs_test_2');

  await sqlRun('update orders set deliver_on = $1::date', [madridToday()]);
  assert.deepEqual(await retryPayment(placed.publicId, ip()), { ok: false, reason: 'too_soon' });
  assert.deepEqual(await retryPayment('x'.repeat(22), ip()), { ok: false, reason: 'not_found' });
});

test('the form: required fields, lengths and a postcode, in Spanish', () => {
  const bad = orderInputSchema.safeParse({ cakeId: 'x', size: 'xl', occasion: 'boda', postalCode: '3001', recipientConsent: false });
  assert.equal(bad.success, false);
  const fields = new Set(bad.success ? [] : bad.error.issues.map((i) => String(i.path[0])));
  for (const f of ['cakeId', 'size', 'occasion', 'postalCode', 'recipientName', 'address', 'deliverOn', 'senderName', 'senderPhone', 'senderEmail', 'recipientConsent']) {
    assert.ok(fields.has(f), `expected an error on ${f}`);
  }
  const long = orderInputSchema.safeParse({ cakeText: 'x'.repeat(61) });
  assert.ok(!long.success && long.error.issues.some((i) => i.path[0] === 'cakeText'));
});
