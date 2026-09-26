/**
 * A fake Stripe for the tests: answers the three calls the app makes and
 * records every request, so a test can check exactly what would have been
 * charged.
 */
import { setStripeFetch } from '../src/server/payments/stripe';

export interface RecordedRequest {
  method: string;
  path: string;
  params: URLSearchParams;
  headers: Record<string, string>;
}

export interface FakeStripe {
  requests: RecordedRequest[];
  sessions: Map<string, Record<string, unknown>>;
  /** Make the next calls fail with this HTTP status. */
  failWith: number | null;
  /** Mark a session paid, as if the customer had completed the page. */
  pay(sessionId: string): void;
  restore(): void;
}

export function installFakeStripe(): FakeStripe {
  let seq = 0;
  const fake: FakeStripe = {
    requests: [],
    sessions: new Map(),
    failWith: null,
    pay(sessionId) {
      const s = fake.sessions.get(sessionId);
      if (!s) throw new Error(`no session ${sessionId}`);
      s.status = 'complete';
      s.payment_status = 'paid';
      s.payment_intent = `pi_test_${sessionId.slice(3)}`;
    },
    restore() {
      setStripeFetch(null);
    },
  };

  setStripeFetch((async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const params = new URLSearchParams(method === 'POST' ? String(init?.body ?? '') : url.search);
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    fake.requests.push({ method, path: url.pathname.replace('/v1', ''), params, headers });
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

    if (fake.failWith) return json(fake.failWith, { error: { message: 'Fake Stripe is down', code: 'fake_down' } });

    if (method === 'POST' && url.pathname === '/v1/checkout/sessions') {
      seq += 1;
      const id = `cs_test_${seq}`;
      let total = 0;
      for (let i = 0; params.has(`line_items[${i}][price_data][unit_amount]`); i++) {
        total += Number(params.get(`line_items[${i}][price_data][unit_amount]`));
      }
      const session = {
        id,
        object: 'checkout.session',
        url: `https://checkout.stripe.test/c/pay/${id}`,
        status: 'open',
        payment_status: 'unpaid',
        amount_total: total,
        currency: 'eur',
        payment_intent: null,
        client_reference_id: params.get('client_reference_id'),
        metadata: { order_id: params.get('metadata[order_id]'), public_id: params.get('metadata[public_id]') },
      };
      fake.sessions.set(id, session);
      return json(200, session);
    }
    const retrieve = /^\/v1\/checkout\/sessions\/(cs_[A-Za-z0-9_]+)$/.exec(url.pathname);
    if (method === 'GET' && retrieve) {
      const s = fake.sessions.get(retrieve[1]!);
      return s ? json(200, s) : json(404, { error: { message: 'No such session' } });
    }
    if (method === 'POST' && url.pathname === '/v1/refunds') {
      seq += 1;
      return json(200, { id: `re_test_${seq}`, amount: Number(params.get('amount')), status: 'succeeded' });
    }
    return json(404, { error: { message: `Fake Stripe has no ${method} ${url.pathname}` } });
  }) as typeof fetch);

  return fake;
}
