import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { env } from '@/lib/env';

/**
 * The three Stripe calls Tartale makes, over plain HTTPS: open a Checkout
 * session, read one back, refund a payment. Plus the webhook signature check.
 *
 * No SDK: three form-encoded POSTs and an HMAC are less code than the
 * dependency, and every line of them is tested (tests/payments.test.ts).
 * The API version is pinned so a change on Stripe's side cannot silently
 * change the shape of what comes back.
 */
export const STRIPE_API_VERSION = '2025-03-31.basil';

/**
 * Stripe's API. `STRIPE_API_BASE` points a development server at the local
 * mock (scripts/stripe-mock.mjs); a production build ignores it, so no
 * setting can ever send the secret key anywhere but Stripe.
 */
const API =
  process.env.NODE_ENV !== 'production' && process.env.STRIPE_API_BASE ? process.env.STRIPE_API_BASE : 'https://api.stripe.com/v1';

export class StripeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = 'StripeError';
  }
}

type Fetch = typeof fetch;
let fetchImpl: Fetch = (...args) => fetch(...args);

/** Tests replace the network with a fake Stripe. */
export function setStripeFetch(impl: Fetch | null): void {
  fetchImpl = impl ?? ((...args) => fetch(...args));
}

export function stripeConfigured(): boolean {
  return env.STRIPE_SECRET_KEY.length > 0;
}

/** Stripe's form encoding: nested objects and arrays as `a[b][0][c]=…`. */
export function formEncode(params: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item !== null && typeof item === 'object') out.push(...formEncode(item as Record<string, unknown>, `${name}[${i}]`));
        else out.push(`${encodeURIComponent(`${name}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof value === 'object') {
      out.push(...formEncode(value as Record<string, unknown>, name));
    } else {
      out.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }
  return out;
}

async function call<T>(method: 'GET' | 'POST', path: string, params?: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  if (!stripeConfigured()) throw new StripeError('Stripe is not configured', 0, 'not_configured');
  const body = params ? formEncode(params).join('&') : undefined;
  const url = method === 'GET' && body ? `${API}${path}?${body}` : `${API}${path}`;
  const response = await fetchImpl(url, {
    method,
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'stripe-version': STRIPE_API_VERSION,
      ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    body: method === 'POST' ? (body ?? '') : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await response.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null;
  if (!response.ok) {
    throw new StripeError(json?.error?.message ?? `Stripe answered ${response.status}`, response.status, json?.error?.code ?? null);
  }
  return json as T;
}

export interface CheckoutSession {
  id: string;
  url: string | null;
  status: 'open' | 'complete' | 'expired' | null;
  payment_status: 'paid' | 'unpaid' | 'no_payment_required';
  amount_total: number | null;
  currency: string | null;
  payment_intent: string | null;
  client_reference_id: string | null;
  metadata: Record<string, string> | null;
}

export interface CheckoutLine {
  name: string;
  description?: string;
  unitAmountCents: number;
}

/**
 * A hosted payment page for one order. Prices come from our database, never
 * from the browser; the order's id rides along in the metadata so the webhook
 * can find it again. The page expires in an hour: after that the day chosen
 * may no longer be possible, and the order can be paid again from its link.
 */
export async function createCheckoutSession(input: {
  orderId: number;
  publicId: string;
  lines: CheckoutLine[];
  customerEmail: string | null;
  successUrl: string;
  cancelUrl: string;
  attempt: number;
  expiresInSeconds?: number;
}): Promise<CheckoutSession> {
  const expiresAt = Math.floor(Date.now() / 1000) + (input.expiresInSeconds ?? 60 * 60);
  return call<CheckoutSession>(
    'POST',
    '/checkout/sessions',
    {
      mode: 'payment',
      locale: 'es',
      submit_type: 'pay',
      // Card covers Apple Pay and Google Pay too; nothing that settles days
      // later, so an order is either paid or not when the page closes.
      payment_method_types: ['card'],
      customer_email: input.customerEmail ?? undefined,
      client_reference_id: String(input.orderId),
      metadata: { order_id: String(input.orderId), public_id: input.publicId },
      payment_intent_data: {
        description: `Tartale · pedido ${input.orderId}`,
        metadata: { order_id: String(input.orderId) },
      },
      line_items: input.lines.map((line) => ({
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: line.unitAmountCents,
          product_data: { name: line.name, ...(line.description ? { description: line.description } : {}) },
        },
      })),
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      expires_at: expiresAt,
    },
    `checkout-${input.orderId}-${input.attempt}`,
  );
}

export async function retrieveCheckoutSession(id: string): Promise<CheckoutSession> {
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) throw new StripeError('Invalid session id', 400, 'invalid_id');
  return call<CheckoutSession>('GET', `/checkout/sessions/${id}`);
}

export interface Refund {
  id: string;
  amount: number;
  status: string;
}

export async function createRefund(input: { paymentIntent: string; amountCents: number; orderId: number; key: string }): Promise<Refund> {
  return call<Refund>(
    'POST',
    '/refunds',
    {
      payment_intent: input.paymentIntent,
      amount: input.amountCents,
      metadata: { order_id: String(input.orderId) },
    },
    input.key,
  );
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/** Five minutes either side: Stripe's own default, and it defeats replaying an old event. */
const WEBHOOK_TOLERANCE_SECONDS = 300;

/**
 * Checks a `Stripe-Signature` header (t=…,v1=…) against the raw body. The
 * signature is an HMAC of "t.body" with the endpoint's secret; any v1 may
 * match (Stripe sends two while a secret is being rolled).
 */
export function verifyWebhook(
  payload: string,
  header: string | null,
  secret: string = env.STRIPE_WEBHOOK_SECRET,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): StripeEvent | null {
  if (!header || !secret) return null;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const timestamp = Number(parts.find(([k]) => k === 't')?.[1]);
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v ?? '');
  if (!Number.isFinite(timestamp) || signatures.length === 0) return null;
  if (Math.abs(nowSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS) return null;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest();
  const matches = signatures.some((sig) => {
    if (!/^[0-9a-f]{64}$/.test(sig)) return false;
    return timingSafeEqual(Buffer.from(sig, 'hex'), expected);
  });
  if (!matches) return null;

  try {
    const event = JSON.parse(payload) as StripeEvent;
    return typeof event?.id === 'string' && typeof event?.type === 'string' && event.data?.object ? event : null;
  } catch {
    return null;
  }
}

/** For tests and local tooling: the header Stripe would send for this payload. */
export function signWebhook(payload: string, secret: string, timestamp: number): string {
  const sig = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}
