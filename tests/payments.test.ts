import assert from 'node:assert/strict';
import test, { after, afterEach, before, beforeEach } from 'node:test';

import { addDays, madridToday, weekday } from '../src/lib/dates';
import { formEncode, signWebhook, verifyWebhook, type StripeEvent } from '../src/server/payments/stripe';
import { listCakes } from '../src/server/repositories/catalog';
import { deleteAbandonedOrders, findOrderByPublicId } from '../src/server/repositories/orders';
import { orderForTracking, placeOrder } from '../src/server/services/order-service';
import { handleStripeEvent, refundOrder } from '../src/server/services/payment-service';
import { orderInputSchema } from '../src/server/validation/schemas';

import { installFakeStripe, type FakeStripe } from './fake-stripe';
import { countRows, resetTestDb, sqlOne, sqlRun, startTestDb, stopTestDb } from './pg-harness';

const SECRET = 'whsec_tartale_unit_tests';
let stripe: FakeStripe;
let ipSeq = 0;

before(() => startTestDb());
beforeEach(async () => {
  await resetTestDb();
  stripe = installFakeStripe();
});
afterEach(() => stripe.restore());
after(stopTestDb);

function aWeekday(): string {
  let day = addDays(madridToday(), 3);
  while (weekday(day) === 0 || weekday(day) === 6) day = addDays(day, 1);
  return day;
}

/** A placed, unpaid order (Lotus mediana + delivery = 56 €). */
async function anOrder() {
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
      senderEmail: 'pablo@startup.es',
      recipientConsent: true,
      elapsedMs: 30_000,
    }),
    `192.0.2.${++ipSeq}`,
  );
  assert.ok(placed.ok);
  return (await findOrderByPublicId(placed.publicId))!;
}

function event(type: string, object: Record<string, unknown>, id = `evt_${Math.random().toString(36).slice(2)}`): StripeEvent {
  return { id, type, data: { object } };
}

test('webhook signatures: the right secret and a fresh timestamp, over the exact body', () => {
  const body = JSON.stringify(event('checkout.session.completed', { id: 'cs_1' }, 'evt_1'));
  const now = 1_790_000_000;
  const header = signWebhook(body, SECRET, now);
  assert.equal(verifyWebhook(body, header, SECRET, now)?.id, 'evt_1');
  assert.equal(verifyWebhook(`${body} `, header, SECRET, now), null); // one byte changed
  assert.equal(verifyWebhook(body, header, 'whsec_someone_else', now), null);
  assert.equal(verifyWebhook(body, header, SECRET, now + 301), null); // replayed later
  assert.equal(verifyWebhook(body, null, SECRET, now), null);
  assert.equal(verifyWebhook(body, 't=abc,v1=zz', SECRET, now), null);
  // While a secret is rolled Stripe sends two signatures; one good one is enough.
  const rolled = `${header},v1=${'0'.repeat(64)}`;
  assert.equal(verifyWebhook(body, rolled, SECRET, now)?.id, 'evt_1');
});

test('Stripe form encoding: nested objects and arrays', () => {
  assert.deepEqual(formEncode({ a: 1, b: { c: 'x y' }, d: [{ e: 2 }], f: ['card'], g: undefined }), [
    'a=1',
    'b%5Bc%5D=x%20y',
    'd%5B0%5D%5Be%5D=2',
    'f%5B0%5D=card',
  ]);
});

test('a completed payment marks the order paid, once, whatever arrives first and however often', async () => {
  const order = await anOrder();
  stripe.pay(order.stripeSessionId!);
  const session = stripe.sessions.get(order.stripeSessionId!)!;

  // The customer comes back first: the page confirms with Stripe itself.
  const tracked = await orderForTracking(order.publicId, order.stripeSessionId);
  assert.equal(tracked?.paymentStatus, 'pagado');
  assert.equal(tracked?.paidCents, 5600);
  assert.equal(tracked?.stripePaymentIntent, `pi_test_${order.stripeSessionId!.slice(3)}`);

  // Then the webhook arrives — and arrives again.
  const completed = event('checkout.session.completed', session, 'evt_paid');
  assert.equal(await handleStripeEvent(completed), 'handled');
  assert.equal(await handleStripeEvent(completed), 'duplicate');
  assert.equal(await countRows('audit_log', `where action = 'order.paid'`), 1);
  assert.equal((await findOrderByPublicId(order.publicId))?.paidCents, 5600);
});

test('a session id in the return URL proves nothing on its own', async () => {
  const order = await anOrder();
  // Not paid at Stripe: the page must not believe the query string.
  assert.equal((await orderForTracking(order.publicId, order.stripeSessionId))?.paymentStatus, 'pendiente');
  // Someone else's session id: ignored.
  assert.equal((await orderForTracking(order.publicId, 'cs_test_999'))?.paymentStatus, 'pendiente');
});

test('an expired payment page leaves the order abandoned, and paying later still works', async () => {
  const order = await anOrder();
  await handleStripeEvent(event('checkout.session.expired', { id: order.stripeSessionId, metadata: { order_id: String(order.id) } }));
  assert.equal((await findOrderByPublicId(order.publicId))?.paymentStatus, 'caducado');
  // An old session expiring must not touch a newer one.
  await sqlRun(`update orders set stripe_session_id = 'cs_new', payment_status = 'pendiente'`);
  await handleStripeEvent(event('checkout.session.expired', { id: order.stripeSessionId, metadata: { order_id: String(order.id) } }));
  assert.equal((await findOrderByPublicId(order.publicId))?.paymentStatus, 'pendiente');
});

test('refunds: all, part, never more than was paid, and nothing changes if Stripe fails', async () => {
  const order = await anOrder();
  stripe.pay(order.stripeSessionId!);
  await handleStripeEvent(event('checkout.session.completed', stripe.sessions.get(order.stripeSessionId!)!));

  assert.deepEqual(await refundOrder(order.id, 6000), { ok: false, reason: 'too_much' });

  stripe.failWith = 500;
  const failed = await refundOrder(order.id, 1000);
  assert.equal(failed.ok, false);
  assert.equal((await findOrderByPublicId(order.publicId))?.refundedCents, 0);
  stripe.failWith = null;

  const part = await refundOrder(order.id, 1000);
  assert.ok(part.ok);
  assert.equal(part.order.paymentStatus, 'parcial');
  assert.equal(part.order.refundedCents, 1000);
  const refundCall = stripe.requests.filter((r) => r.path === '/refunds').at(-1)!;
  assert.equal(refundCall.params.get('amount'), '1000');
  assert.equal(refundCall.headers['idempotency-key'], `refund-${order.id}-0-1000`);

  const rest = await refundOrder(order.id, null);
  assert.ok(rest.ok);
  assert.equal(rest.order.paymentStatus, 'reembolsado');
  assert.equal(rest.order.refundedCents, 5600);
  assert.deepEqual(await refundOrder(order.id, null), { ok: false, reason: 'not_refundable' });
});

test('a refund made in Stripe’s own dashboard reaches the order', async () => {
  const order = await anOrder();
  stripe.pay(order.stripeSessionId!);
  await handleStripeEvent(event('checkout.session.completed', stripe.sessions.get(order.stripeSessionId!)!));
  const pi = (await findOrderByPublicId(order.publicId))!.stripePaymentIntent!;
  await handleStripeEvent(event('charge.refunded', { payment_intent: pi, amount_refunded: 5600 }));
  const refunded = await findOrderByPublicId(order.publicId);
  assert.equal(refunded?.paymentStatus, 'reembolsado');
  assert.equal(refunded?.refundedCents, 5600);
  // An older, smaller figure arriving late never lowers it.
  await handleStripeEvent(event('charge.refunded', { payment_intent: pi, amount_refunded: 1000 }));
  assert.equal((await findOrderByPublicId(order.publicId))?.refundedCents, 5600);
});

test('unknown events are acknowledged and ignored', async () => {
  assert.equal(await handleStripeEvent(event('customer.created', { id: 'cus_1' })), 'ignored');
});

test('orders never paid are deleted after two days, photo and all; paid ones stay', async () => {
  const unpaid = await anOrder();
  const paid = await anOrder();
  stripe.pay(paid.stripeSessionId!);
  await handleStripeEvent(event('checkout.session.completed', stripe.sessions.get(paid.stripeSessionId!)!));
  await sqlRun(`insert into order_photos (order_id, mime, bytes) values ($1, 'image/jpeg', '\\xffd8ff'::bytea)`, [unpaid.id]);

  assert.equal(await deleteAbandonedOrders(2), 0); // too recent
  await sqlRun(`update orders set created_at = now() - interval '3 days'`);
  assert.equal(await deleteAbandonedOrders(2), 1);
  assert.equal(await findOrderByPublicId(unpaid.publicId), null);
  assert.equal(await countRows('order_photos'), 0);
  assert.equal((await sqlOne<{ c: number }>('select count(*)::int as c from orders'))?.c, 1);
});
