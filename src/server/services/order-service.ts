import 'server-only';

import { CONSENT_TEXT } from '@/lib/constants';
import { checkDeliveryDay, type DayProblem } from '@/lib/dates';
import { ORDER_PHOTO, priceFor, signOffFor } from '@/lib/orders';
import { getDb } from '@/server/db/pg';
import { findBakery, findCake, zoneForPostcode } from '@/server/repositories/catalog';
import {
  deleteOrder,
  findOrderByPublicId,
  insertOrder,
  recordMarketingConsent,
  saveOrderPhoto,
  type Order,
} from '@/server/repositories/orders';
import { getSettings } from '@/server/repositories/settings';
import { stripeConfigured } from '@/server/payments/stripe';
import { hashIp, randomToken } from '@/server/security/hash';
import { ANONYMOUS_BUCKET, RULES, consume } from '@/server/security/rate-limit';
import type { OrderInput } from '@/server/validation/schemas';

import { confirmFromReturn, openCheckout } from './payment-service';

/** Below this, the form was filled in by a script, not a person. */
export const MIN_HUMAN_MS = 6000;

/** 16 random bytes: a 22-character link nobody can guess or enumerate. */
export function newPublicId(): string {
  return randomToken(16);
}

const SIGNATURES: Array<{ mime: (typeof ORDER_PHOTO.types)[number]; test: (b: Buffer) => boolean }> = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

/**
 * The photo for the cake, from the data URL the browser sent. Its type is
 * read from the file's first bytes, not from what the browser claimed: only a
 * real JPEG, PNG or WebP of at most 1.5 MB is kept, and it is served back
 * with that type — so an HTML page renamed .jpg is refused, not stored.
 */
export function decodePhoto(dataUrl: string): { mime: string; bytes: Buffer } | null {
  const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) return null;
  const bytes = Buffer.from(match[1]!, 'base64');
  if (bytes.length < 100 || bytes.length > ORDER_PHOTO.maxBytes) return null;
  const kind = SIGNATURES.find((s) => s.test(bytes));
  return kind ? { mime: kind.mime, bytes } : null;
}

export type PlaceOrderFailure =
  | 'rate_limited'
  | 'rejected'
  | 'closed'
  | 'payments_off'
  | 'zone'
  | 'cake'
  | 'size'
  | 'no_photo'
  | 'photo'
  | DayProblem
  | 'payment_unavailable';

export type PlaceOrderResult =
  | { ok: true; publicId: string; paymentUrl: string }
  | { ok: false; reason: PlaceOrderFailure; field?: string };

/**
 * An order from /enviar. Every rule is checked here, against the database, in
 * this order; the browser only ever sends ids and text. Prices, the delivery
 * charge and the bakery come from the database. The order is stored unpaid,
 * then Stripe's payment page is opened for it; if that fails the order is
 * removed again, so there is never an order nobody can pay for.
 */
export async function placeOrder(input: OrderInput, ip: string | null): Promise<PlaceOrderResult> {
  const ipHash = hashIp(ip);
  if (!(await consume(RULES.order, ipHash ?? ANONYMOUS_BUCKET)).allowed) return { ok: false, reason: 'rate_limited' };
  if (input.website || input.elapsedMs === undefined || input.elapsedMs < MIN_HUMAN_MS) return { ok: false, reason: 'rejected' };

  const settings = await getSettings();
  if (!settings.ordersEnabled) return { ok: false, reason: 'closed' };
  if (!stripeConfigured()) return { ok: false, reason: 'payments_off' };

  const zone = await zoneForPostcode(input.postalCode);
  if (!zone) return { ok: false, reason: 'zone', field: 'postalCode' };

  const cake = await findCake(input.cakeId);
  if (!cake || !cake.active || cake.bakeryId !== zone.bakeryId) return { ok: false, reason: 'cake', field: 'cakeId' };
  const priceCents = priceFor(cake.prices, input.size);
  if (priceCents === null) return { ok: false, reason: 'size', field: 'size' };

  const dayProblem = checkDeliveryDay(input.deliverOn, settings);
  if (dayProblem) return { ok: false, reason: dayProblem, field: 'deliverOn' };

  const bakery = await findBakery(zone.bakeryId);
  if (!bakery?.active) return { ok: false, reason: 'zone', field: 'postalCode' };
  if (input.photo && !bakery.printsPhotos) return { ok: false, reason: 'no_photo', field: 'photo' };
  const photo = input.photo ? decodePhoto(input.photo) : null;
  if (input.photo && !photo) return { ok: false, reason: 'photo', field: 'photo' };

  const order = await getDb().transaction(async (tx) => {
    const created = await insertOrder(
      {
        publicId: newPublicId(),
        source: 'web',
        paymentMethod: 'stripe',
        occasion: input.occasion,
        bakeryId: bakery.id,
        zoneId: zone.id,
        cakeId: cake.id,
        cakeName: cake.name,
        size: input.size,
        priceCents,
        deliveryCents: zone.deliveryCents,
        cakeText: input.cakeText,
        cardMessage: input.cardMessage,
        signOff: signOffFor({ anonymous: input.anonymous, signOff: input.signOff, senderName: input.senderName }),
        anonymous: input.anonymous,
        allergies: input.allergies,
        recipientName: input.recipientName,
        recipientCompany: input.recipientCompany,
        recipientPhone: input.recipientPhone,
        addressKind: input.addressKind,
        address: input.address,
        postalCode: input.postalCode,
        city: zone.city,
        deliveryNotes: input.deliveryNotes,
        deliverOn: input.deliverOn,
        timeSlot: input.timeSlot,
        senderName: input.senderName,
        senderPhone: input.senderPhone,
        senderEmail: input.senderEmail,
        senderCompany: input.senderCompany,
        companyId: null,
        birthdayId: null,
        birthdayYear: null,
        ipHash,
      },
      tx,
    );
    if (created && photo) await saveOrderPhoto(created.id, photo.mime, photo.bytes, tx);
    return created;
  });
  if (!order) return { ok: false, reason: 'rejected' };

  let paymentUrl: string;
  try {
    paymentUrl = (await openCheckout({ ...order, hasPhoto: photo !== null })).url;
  } catch (error) {
    console.error('[orders] could not open the payment page', error);
    await deleteOrder(order.id);
    return { ok: false, reason: 'payment_unavailable' };
  }

  // Consent to news is separate from the order and survives its erasure.
  if (input.marketingOptIn) {
    await recordMarketingConsent({ email: input.senderEmail, name: input.senderName, consentText: CONSENT_TEXT.marketing });
  }
  return { ok: true, publicId: order.publicId, paymentUrl };
}

export type RetryPaymentResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'rate_limited' | 'not_found' | 'already_paid' | 'cancelled' | 'payments_off' | DayProblem | 'payment_unavailable' };

/**
 * "Pagar ahora" on an unpaid order's page: a fresh payment page, as long as
 * the day chosen can still be met. The link is the only credential, exactly
 * as for reading the page.
 */
export async function retryPayment(publicId: string, ip: string | null): Promise<RetryPaymentResult> {
  const ipHash = hashIp(ip);
  if (!(await consume(RULES.payment, ipHash ?? ANONYMOUS_BUCKET)).allowed) return { ok: false, reason: 'rate_limited' };
  const order = await findOrderByPublicId(publicId);
  if (!order || order.erased || order.paymentMethod !== 'stripe') return { ok: false, reason: 'not_found' };
  if (order.status === 'cancelado') return { ok: false, reason: 'cancelled' };
  if (order.paymentStatus !== 'pendiente' && order.paymentStatus !== 'caducado') return { ok: false, reason: 'already_paid' };
  if (!stripeConfigured()) return { ok: false, reason: 'payments_off' };

  const settings = await getSettings();
  const dayProblem = checkDeliveryDay(order.deliverOn, settings);
  if (dayProblem) return { ok: false, reason: dayProblem };

  try {
    return { ok: true, url: (await openCheckout(order)).url };
  } catch (error) {
    console.error('[orders] could not reopen the payment page', error);
    return { ok: false, reason: 'payment_unavailable' };
  }
}

/** The tracking page, after Stripe sends the customer back: confirm the payment if the webhook has not yet. */
export async function orderForTracking(publicId: string, sessionId: string | null): Promise<Order | null> {
  let order = await findOrderByPublicId(publicId);
  if (!order || order.erased) return null;
  if (sessionId && (order.paymentStatus === 'pendiente' || order.paymentStatus === 'caducado')) {
    if (await confirmFromReturn(order, sessionId)) order = await findOrderByPublicId(publicId);
  }
  return order;
}
