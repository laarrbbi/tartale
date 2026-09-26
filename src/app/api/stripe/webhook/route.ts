import { NextResponse } from 'next/server';

import { BodyTooLargeError, readBodyText } from '@/server/http/body';
import { verifyWebhook } from '@/server/payments/stripe';
import { handleStripeEvent } from '@/server/services/payment-service';

export const dynamic = 'force-dynamic';

/**
 * Stripe's webhook. No same-origin check here — Stripe is not a browser — but
 * nothing is believed until the signature over the exact raw body checks out
 * with STRIPE_WEBHOOK_SECRET. Anything else is a 400 and changes nothing.
 * A handling error answers 500, so Stripe retries later.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let payload: string;
  try {
    payload = await readBodyText(request, 512 * 1024);
  } catch (error) {
    return NextResponse.json({ error: error instanceof BodyTooLargeError ? 'too large' : 'bad body' }, { status: 400 });
  }
  const event = verifyWebhook(payload, request.headers.get('stripe-signature'));
  if (!event) return NextResponse.json({ error: 'invalid signature' }, { status: 400 });

  try {
    const outcome = await handleStripeEvent(event);
    return NextResponse.json({ received: true, outcome });
  } catch (error) {
    console.error('[stripe] webhook handling failed', event.type, event.id, error);
    return NextResponse.json({ error: 'handling failed' }, { status: 500 });
  }
}
