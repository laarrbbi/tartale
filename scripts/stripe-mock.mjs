#!/usr/bin/env node
/**
 * A stand-in for Stripe, for trying the whole order flow on a development
 * machine without a Stripe account or a network.
 *
 *   STRIPE_WEBHOOK_SECRET=whsec_dev APP_WEBHOOK_URL=http://localhost:3000/api/stripe/webhook \
 *     node scripts/stripe-mock.mjs
 *
 * then run the app with `next dev` and
 *   STRIPE_API_BASE=http://localhost:12111/v1 STRIPE_SECRET_KEY=sk_test_dev STRIPE_WEBHOOK_SECRET=whsec_dev
 *
 * It answers the three calls the app makes (open a Checkout session, read it,
 * refund), serves a one-button "payment page", and sends signed webhooks the
 * way Stripe does. A production build never talks to it (see stripe.ts).
 */
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 12111);
const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_dev';
const WEBHOOK = process.env.APP_WEBHOOK_URL ?? '';
const sessions = new Map();
let seq = 0;

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function sendWebhook(type, object) {
  if (!WEBHOOK) return;
  const payload = JSON.stringify({ id: `evt_mock_${++seq}`, type, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', SECRET).update(`${t}.${payload}`).digest('hex');
  const response = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` },
    body: payload,
  }).catch((e) => ({ status: `error ${e.message}` }));
  console.log(`[stripe-mock] webhook ${type} → ${response.status}`);
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (req.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
    const params = new URLSearchParams(await readBody(req));
    const id = `cs_mock_${++seq}`;
    let total = 0;
    for (let i = 0; params.has(`line_items[${i}][price_data][unit_amount]`); i++) {
      total += Number(params.get(`line_items[${i}][price_data][unit_amount]`));
    }
    const session = {
      id,
      object: 'checkout.session',
      url: `http://localhost:${PORT}/pay/${id}`,
      status: 'open',
      payment_status: 'unpaid',
      amount_total: total,
      currency: 'eur',
      payment_intent: null,
      client_reference_id: params.get('client_reference_id'),
      metadata: { order_id: params.get('metadata[order_id]'), public_id: params.get('metadata[public_id]') },
      success_url: params.get('success_url'),
      cancel_url: params.get('cancel_url'),
    };
    sessions.set(id, session);
    return json(res, 200, session);
  }

  const read = /^\/v1\/checkout\/sessions\/(cs_[\w]+)$/.exec(url.pathname);
  if (req.method === 'GET' && read) {
    const s = sessions.get(read[1]);
    return s ? json(res, 200, s) : json(res, 404, { error: { message: 'No such checkout session' } });
  }

  if (req.method === 'POST' && url.pathname === '/v1/refunds') {
    const params = new URLSearchParams(await readBody(req));
    const amount = Number(params.get('amount'));
    const pi = params.get('payment_intent');
    const paid = [...sessions.values()].find((s) => s.payment_intent === pi);
    if (paid) paid.refunded = (paid.refunded ?? 0) + amount;
    setTimeout(() => sendWebhook('charge.refunded', { payment_intent: pi, amount_refunded: paid?.refunded ?? amount }), 300);
    return json(res, 200, { id: `re_mock_${++seq}`, amount, status: 'succeeded' });
  }

  const pay = /^\/pay\/(cs_[\w]+)$/.exec(url.pathname);
  if (req.method === 'GET' && pay) {
    const s = sessions.get(pay[1]);
    if (!s) return json(res, 404, { error: 'no session' });
    const action = url.searchParams.get('action');
    if (action === 'pay') {
      s.status = 'complete';
      s.payment_status = 'paid';
      s.payment_intent = `pi_mock_${s.id.slice(8)}`;
      await sendWebhook('checkout.session.completed', s);
      res.writeHead(303, { location: s.success_url.replace('{CHECKOUT_SESSION_ID}', s.id) });
      return res.end();
    }
    if (action === 'cancel') {
      res.writeHead(303, { location: s.cancel_url });
      return res.end();
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(`<!doctype html><meta name=viewport content="width=device-width"><title>Stripe (simulado)</title>
      <body style="font-family:system-ui;max-width:28rem;margin:3rem auto;padding:1rem">
      <h1>Pago simulado</h1><p>Importe: ${(s.amount_total / 100).toFixed(2).replace('.', ',')} €</p>
      <p><a id="pay" href="?action=pay">Pagar con la tarjeta de prueba</a></p>
      <p><a id="cancel" href="?action=cancel">Volver sin pagar</a></p></body>`);
  }

  json(res, 404, { error: { message: `No mock for ${req.method} ${url.pathname}` } });
}).listen(PORT, () => console.log(`[stripe-mock] listening on http://localhost:${PORT}`));
