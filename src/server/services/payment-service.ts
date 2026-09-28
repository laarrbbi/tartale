import 'server-only';

import { env } from '@/lib/env';
import { SIZES, formatEuros } from '@/lib/orders';
import { recordAudit } from '@/server/repositories/audit';
import {
  findOrderById,
  markCheckoutAbandoned,
  markOrderPaid,
  recordRefund,
  recordStripeEvent,
  setCheckoutSession,
  stripeEventSeen,
  syncRefundedTotal,
  type Order,
} from '@/server/repositories/orders';
import { invoiceAfterPayment, rectifyAfterChange } from '@/server/services/invoice-service';
import {
  StripeError,
  createCheckoutSession,
  createRefund,
  retrieveCheckoutSession,
  type CheckoutSession,
  type StripeEvent,
} from '@/server/payments/stripe';

/** Where Stripe sends the customer back: their tracking page, which confirms the payment itself. */
export function trackingUrl(publicId: string): string {
  return `${env.APP_ORIGIN}/pedido/${publicId}`;
}

/**
 * Opens a Stripe payment page for an unpaid order. The lines are rebuilt from
 * the order as stored — prices were fixed from the database when it was
 * placed — so nothing the browser sends can change what is charged.
 */
export async function openCheckout(order: Order): Promise<{ url: string }> {
  const top = order.hasPhoto ? (order.cakeText ? 'tu foto y tu frase encima' : 'tu foto encima') : order.cakeText ? 'tu frase encima' : null;
  const box = order.hasDocument ? 'tu tarjeta y tu documento impreso en la caja' : 'tu tarjeta en la caja';
  const lines = [
    {
      name: `Tarta ${order.cakeName} (${SIZES[order.size].label.toLowerCase()})`,
      description: `Con ${top ? `${top}; ` : ''}${box}`,
      unitAmountCents: order.priceCents,
    },
  ];
  if (order.deliveryCents > 0) {
    lines.push({ name: `Entrega en ${order.city}`, description: 'El día y la franja que has elegido', unitAmountCents: order.deliveryCents });
  }
  const session = await createCheckoutSession({
    orderId: order.id,
    publicId: order.publicId,
    lines,
    customerEmail: order.senderEmail,
    successUrl: `${trackingUrl(order.publicId)}?pago=ok&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${trackingUrl(order.publicId)}?pago=cancelado`,
    // Each attempt needs its own idempotency key; the time makes it unique
    // while a double click inside the same second still lands on one session.
    attempt: Math.floor(Date.now() / 1000),
  });
  if (!session.url) throw new StripeError('Stripe returned no payment URL', 502, null);
  await setCheckoutSession(order.id, session.id);
  return { url: session.url };
}

/**
 * Applies a completed Checkout session to its order. Called from the webhook
 * and from the page Stripe returns the customer to; whichever comes second
 * finds the order already paid and changes nothing.
 */
export async function applyCompletedSession(session: CheckoutSession): Promise<Order | null> {
  const orderId = Number(session.metadata?.order_id ?? session.client_reference_id);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) return null;
  if (session.payment_status !== 'paid' || session.currency?.toLowerCase() !== 'eur') return null;

  const order = await findOrderById(orderId);
  if (!order || order.paymentMethod !== 'stripe') return null;

  const paid = await markOrderPaid(orderId, {
    sessionId: session.id,
    paymentIntent: session.payment_intent,
    amountCents: session.amount_total ?? 0,
  });
  if (paid) {
    const mismatch = (session.amount_total ?? 0) !== order.totalCents;
    await recordAudit({
      actorId: null,
      actorEmail: 'stripe',
      action: 'order.paid',
      target: `order:${orderId}`,
      detail: `${formatEuros(session.amount_total ?? 0)}${mismatch ? ` (el pedido era ${formatEuros(order.totalCents)})` : ''}`,
    });
    await invoiceAfterPayment(orderId);
  }
  return paid;
}

/** The return from Stripe: confirm with Stripe itself, never with the query string alone. */
export async function confirmFromReturn(order: Order, sessionId: string): Promise<boolean> {
  if (order.paymentStatus !== 'pendiente' && order.paymentStatus !== 'caducado') return false;
  if (!order.stripeSessionId || order.stripeSessionId !== sessionId) return false;
  try {
    const session = await retrieveCheckoutSession(sessionId);
    return (await applyCompletedSession(session)) !== null;
  } catch (error) {
    console.error('[payments] could not confirm on return', error);
    return false;
  }
}

/**
 * One webhook event. Stripe retries anything that is not a 2xx, and may send
 * an event more than once: every branch below is idempotent, and handled
 * events are remembered so a retry is a no-op.
 */
export async function handleStripeEvent(event: StripeEvent): Promise<'handled' | 'ignored' | 'duplicate'> {
  if (await stripeEventSeen(event.id)) return 'duplicate';
  const object = event.data.object;
  let outcome: 'handled' | 'ignored' = 'handled';

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      await applyCompletedSession(object as unknown as CheckoutSession);
      break;
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed': {
      const session = object as unknown as CheckoutSession;
      const orderId = Number(session.metadata?.order_id ?? session.client_reference_id);
      if (Number.isSafeInteger(orderId) && orderId > 0) await markCheckoutAbandoned(orderId, session.id);
      break;
    }
    case 'charge.refunded': {
      const paymentIntent = typeof object.payment_intent === 'string' ? object.payment_intent : null;
      const refunded = typeof object.amount_refunded === 'number' ? object.amount_refunded : null;
      if (paymentIntent && refunded !== null) {
        const order = await syncRefundedTotal(paymentIntent, refunded);
        if (order) {
          await recordAudit({
            actorId: null,
            actorEmail: 'stripe',
            action: 'order.refund_synced',
            target: `order:${order.id}`,
            detail: `Devuelto en total: ${formatEuros(order.refundedCents)}`,
          });
          await rectifyAfterChange(order.id, { id: null, email: 'stripe' });
        }
      }
      break;
    }
    default:
      outcome = 'ignored';
  }

  await recordStripeEvent(event.id, event.type);
  return outcome;
}

export type RefundResult =
  | { ok: true; order: Order }
  | { ok: false; reason: 'not_found' | 'not_refundable' | 'too_much' | 'stripe'; message?: string };

/**
 * Gives money back through Stripe, all of what is left or part of it. The
 * idempotency key is built from what has been refunded so far, so a double
 * click refunds once, and a second deliberate refund later is still possible.
 * An invoiced order gets its rectificativa for what went back.
 */
export async function refundOrder(
  orderId: number,
  amountCents: number | null,
  actor: { id: number | null; email: string | null } = { id: null, email: null },
): Promise<RefundResult> {
  const order = await findOrderById(orderId);
  if (!order) return { ok: false, reason: 'not_found' };
  const refundable = order.paidCents - order.refundedCents;
  if (
    order.paymentMethod !== 'stripe' ||
    !order.stripePaymentIntent ||
    (order.paymentStatus !== 'pagado' && order.paymentStatus !== 'parcial') ||
    refundable <= 0
  ) {
    return { ok: false, reason: 'not_refundable' };
  }
  const amount = amountCents ?? refundable;
  if (amount <= 0 || amount > refundable) return { ok: false, reason: 'too_much' };

  try {
    await createRefund({
      paymentIntent: order.stripePaymentIntent,
      amountCents: amount,
      orderId: order.id,
      key: `refund-${order.id}-${order.refundedCents}-${amount}`,
    });
  } catch (error) {
    const message = error instanceof StripeError ? error.message : 'Stripe no respondió';
    console.error('[payments] refund failed', error);
    return { ok: false, reason: 'stripe', message };
  }
  const updated = await recordRefund(order.id, amount);
  if (!updated) return { ok: false, reason: 'not_refundable' };
  await rectifyAfterChange(order.id, actor);
  return { ok: true, order: updated };
}
