import 'server-only';

import type {
  AddressKind,
  CakeSize,
  Occasion,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  TimeSlot,
} from '@/lib/orders';
import { getDb, iso, isoRequired, one, type Db } from '@/server/db/pg';

/**
 * Orders. `public_id` is the sender's tracking link: random, and it grants
 * reading only. The people in an order are erased 90 days after delivery;
 * what was sold, when and for how much stays for the books.
 */
export interface Order {
  id: number;
  publicId: string;
  source: OrderSource;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  occasion: Occasion;
  bakeryId: number;
  zoneId: number | null;
  cakeId: number | null;
  cakeName: string;
  size: CakeSize;
  priceCents: number;
  deliveryCents: number;
  totalCents: number;
  paidCents: number;
  refundedCents: number;
  hasPhoto: boolean;
  cakeText: string | null;
  cardMessage: string | null;
  signOff: string | null;
  anonymous: boolean;
  allergies: string | null;
  recipientName: string | null;
  recipientCompany: string | null;
  recipientPhone: string | null;
  addressKind: AddressKind;
  address: string | null;
  postalCode: string | null;
  city: string;
  deliveryNotes: string | null;
  deliverOn: string;
  timeSlot: TimeSlot;
  senderName: string | null;
  senderPhone: string | null;
  senderEmail: string | null;
  senderCompany: string | null;
  companyId: number | null;
  birthdayId: number | null;
  birthdayYear: number | null;
  staffNote: string | null;
  stripeSessionId: string | null;
  stripePaymentIntent: string | null;
  paidAt: string | null;
  refundedAt: string | null;
  createdAt: string;
  statusChangedAt: string;
  erased: boolean;
}

interface OrderRow {
  id: number;
  public_id: string;
  source: OrderSource;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  occasion: Occasion;
  bakery_id: number;
  zone_id: number | null;
  cake_id: number | null;
  cake_name: string;
  size: CakeSize;
  price_cents: number;
  delivery_cents: number;
  total_cents: number;
  paid_cents: number;
  refunded_cents: number;
  has_photo: boolean;
  cake_text: string | null;
  card_message: string | null;
  sign_off: string | null;
  anonymous: boolean;
  allergies: string | null;
  recipient_name: string | null;
  recipient_company: string | null;
  recipient_phone: string | null;
  address_kind: AddressKind;
  address: string | null;
  postal_code: string | null;
  city: string;
  delivery_notes: string | null;
  deliver_on: string;
  time_slot: TimeSlot;
  sender_name: string | null;
  sender_phone: string | null;
  sender_email: string | null;
  sender_company: string | null;
  company_id: number | null;
  birthday_id: number | null;
  birthday_year: number | null;
  staff_note: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  paid_at: Date | null;
  refunded_at: Date | null;
  created_at: Date;
  status_changed_at: Date;
  erased_at: Date | null;
}

const COLUMNS = `id, public_id, source, status, payment_method, payment_status, occasion, bakery_id, zone_id,
  cake_id, cake_name, size, price_cents, delivery_cents, total_cents, paid_cents, refunded_cents, has_photo,
  cake_text, card_message, sign_off, anonymous, allergies, recipient_name, recipient_company, recipient_phone,
  address_kind, address, postal_code, city, delivery_notes, deliver_on, time_slot, sender_name, sender_phone,
  sender_email, sender_company, company_id, birthday_id, birthday_year, staff_note, stripe_session_id,
  stripe_payment_intent, paid_at, refunded_at, created_at, status_changed_at, erased_at`;

function toOrder(r: OrderRow): Order {
  return {
    id: r.id,
    publicId: r.public_id,
    source: r.source,
    status: r.status,
    paymentMethod: r.payment_method,
    paymentStatus: r.payment_status,
    occasion: r.occasion,
    bakeryId: r.bakery_id,
    zoneId: r.zone_id,
    cakeId: r.cake_id,
    cakeName: r.cake_name,
    size: r.size,
    priceCents: r.price_cents,
    deliveryCents: r.delivery_cents,
    totalCents: r.total_cents,
    paidCents: r.paid_cents,
    refundedCents: r.refunded_cents,
    hasPhoto: r.has_photo,
    cakeText: r.cake_text,
    cardMessage: r.card_message,
    signOff: r.sign_off,
    anonymous: r.anonymous,
    allergies: r.allergies,
    recipientName: r.recipient_name,
    recipientCompany: r.recipient_company,
    recipientPhone: r.recipient_phone,
    addressKind: r.address_kind,
    address: r.address,
    postalCode: r.postal_code,
    city: r.city,
    deliveryNotes: r.delivery_notes,
    deliverOn: r.deliver_on,
    timeSlot: r.time_slot,
    senderName: r.sender_name,
    senderPhone: r.sender_phone,
    senderEmail: r.sender_email,
    senderCompany: r.sender_company,
    companyId: r.company_id,
    birthdayId: r.birthday_id,
    birthdayYear: r.birthday_year,
    staffNote: r.staff_note,
    stripeSessionId: r.stripe_session_id,
    stripePaymentIntent: r.stripe_payment_intent,
    paidAt: iso(r.paid_at),
    refundedAt: iso(r.refunded_at),
    createdAt: isoRequired(r.created_at),
    statusChangedAt: isoRequired(r.status_changed_at),
    erased: r.erased_at !== null,
  };
}

export interface NewOrder {
  publicId: string;
  source: OrderSource;
  paymentMethod: PaymentMethod;
  occasion: Occasion;
  bakeryId: number;
  zoneId: number | null;
  cakeId: number | null;
  cakeName: string;
  size: CakeSize;
  priceCents: number;
  deliveryCents: number;
  cakeText: string | null;
  cardMessage: string | null;
  signOff: string | null;
  anonymous: boolean;
  allergies: string | null;
  recipientName: string;
  recipientCompany: string | null;
  recipientPhone: string | null;
  addressKind: AddressKind;
  address: string;
  postalCode: string;
  city: string;
  deliveryNotes: string | null;
  deliverOn: string;
  timeSlot: TimeSlot;
  senderName: string | null;
  senderPhone: string | null;
  senderEmail: string | null;
  senderCompany: string | null;
  companyId: number | null;
  birthdayId: number | null;
  birthdayYear: number | null;
  ipHash: string | null;
}

/**
 * Inserts an order. Null when it would be a second order for the same
 * birthday in the same year (the unique index says no; nothing is thrown).
 */
export async function insertOrder(input: NewOrder, db: Db = getDb()): Promise<Order | null> {
  const row = await one<OrderRow>(
    db,
    `insert into orders (public_id, source, payment_method, occasion, bakery_id, zone_id, cake_id, cake_name, size,
        price_cents, delivery_cents, cake_text, card_message, sign_off, anonymous, allergies, recipient_name,
        recipient_company, recipient_phone, address_kind, address, postal_code, city, delivery_notes, deliver_on,
        time_slot, sender_name, sender_phone, sender_email, sender_company, company_id, birthday_id, birthday_year, ip_hash)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
             $24, $25::date, $26, $27, $28, $29, $30, $31, $32, $33, $34)
     on conflict do nothing
     returning ${COLUMNS}`,
    [
      input.publicId,
      input.source,
      input.paymentMethod,
      input.occasion,
      input.bakeryId,
      input.zoneId,
      input.cakeId,
      input.cakeName,
      input.size,
      input.priceCents,
      input.deliveryCents,
      input.cakeText,
      input.cardMessage,
      input.signOff,
      input.anonymous,
      input.allergies,
      input.recipientName,
      input.recipientCompany,
      input.recipientPhone,
      input.addressKind,
      input.address,
      input.postalCode,
      input.city,
      input.deliveryNotes,
      input.deliverOn,
      input.timeSlot,
      input.senderName,
      input.senderPhone,
      input.senderEmail,
      input.senderCompany,
      input.companyId,
      input.birthdayId,
      input.birthdayYear,
      input.ipHash,
    ],
  );
  return row ? toOrder(row) : null;
}

export async function findOrderByPublicId(publicId: string): Promise<Order | null> {
  const row = await one<OrderRow>(getDb(), `select ${COLUMNS} from orders where public_id = $1`, [publicId]);
  return row ? toOrder(row) : null;
}

export async function findOrderById(id: number): Promise<Order | null> {
  const row = await one<OrderRow>(getDb(), `select ${COLUMNS} from orders where id = $1`, [id]);
  return row ? toOrder(row) : null;
}

/** Deletes an order outright (one that never became an order: the payment page could not open). */
export async function deleteOrder(id: number): Promise<void> {
  await getDb().query('delete from orders where id = $1', [id]);
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

export const ORDER_FILTERS = {
  activos: 'Por entregar',
  nuevo: 'Por confirmar',
  hoy: 'Hoy',
  entregado: 'Entregados',
  cancelado: 'Cancelados',
  sin_pagar: 'Sin pagar',
  todos: 'Todos',
} as const;
export type OrderFilter = keyof typeof ORDER_FILTERS;

/**
 * Real orders only, unless asked: a web order whose payment page was never
 * completed is not an order yet, and only the "Sin pagar" filter shows it.
 */
const IS_REAL = `(payment_method <> 'stripe' or payment_status not in ('pendiente', 'caducado'))`;

/** Orders still to deliver, per bakery: what each one has on its plate. */
export async function countActiveOrdersByBakery(): Promise<Map<number, number>> {
  const { rows } = await getDb().query<{ bakery_id: number; c: number }>(
    `select bakery_id, count(*)::int as c from orders
      where erased_at is null and ${IS_REAL} and status not in ('entregado', 'cancelado')
      group by bakery_id`,
  );
  return new Map(rows.map((r) => [r.bakery_id, r.c]));
}

export async function listOrders(options: { filter?: OrderFilter; today: string; bakeryId?: number; limit?: number }): Promise<Order[]> {
  const { filter = 'activos', today, bakeryId = null, limit = 300 } = options;
  const where: Record<OrderFilter, string> = {
    activos: `${IS_REAL} and status not in ('entregado', 'cancelado')`,
    nuevo: `${IS_REAL} and status = 'nuevo'`,
    hoy: `${IS_REAL} and deliver_on = $1::date and status <> 'cancelado'`,
    entregado: `status = 'entregado'`,
    cancelado: `status = 'cancelado' and ${IS_REAL}`,
    sin_pagar: `payment_method = 'stripe' and payment_status in ('pendiente', 'caducado')`,
    todos: 'true',
  };
  const order = filter === 'entregado' || filter === 'cancelado' || filter === 'todos' ? 'deliver_on desc, id desc' : 'deliver_on, time_slot, id';
  const { rows } = await getDb().query<OrderRow>(
    `select ${COLUMNS} from orders
      where erased_at is null and (${where[filter]}) and ($2::bigint is null or bakery_id = $2)
        and $1::date is not null
      order by ${order}
      limit $3`,
    [today, bakeryId, limit],
  );
  return rows.map(toOrder);
}

export interface OrderStats {
  toConfirm: number;
  today: number;
  week: number;
  monthCents: number;
  monthCount: number;
  unpaid: number;
}

/** The four numbers at the top of the board. Revenue is money actually received, net of refunds. */
export async function getOrderStats(today: string): Promise<OrderStats> {
  const row = await one<{ to_confirm: number; today: number; week: number; month_cents: number; month_count: number; unpaid: number }>(
    getDb(),
    `select
       count(*) filter (where ${IS_REAL} and status = 'nuevo' and erased_at is null)::int as to_confirm,
       count(*) filter (where ${IS_REAL} and deliver_on = $1::date and status <> 'cancelado')::int as today,
       count(*) filter (where ${IS_REAL} and deliver_on between $1::date and $1::date + 6 and status <> 'cancelado')::int as week,
       coalesce(sum(paid_cents - refunded_cents) filter (
         where date_trunc('month', deliver_on) = date_trunc('month', $1::date)), 0)::int as month_cents,
       count(*) filter (
         where ${IS_REAL} and status <> 'cancelado' and date_trunc('month', deliver_on) = date_trunc('month', $1::date))::int as month_count,
       count(*) filter (where payment_method = 'transferencia' and payment_status = 'pendiente'
                          and status <> 'cancelado' and erased_at is null)::int as unpaid
     from orders`,
    [today],
  );
  return {
    toConfirm: row?.to_confirm ?? 0,
    today: row?.today ?? 0,
    week: row?.week ?? 0,
    monthCents: row?.month_cents ?? 0,
    monthCount: row?.month_count ?? 0,
    unpaid: row?.unpaid ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Changes from the panel
// ---------------------------------------------------------------------------

export async function setOrderStatus(id: number, status: OrderStatus): Promise<Order | null> {
  const row = await one<OrderRow>(
    getDb(),
    `update orders set status = $2, status_changed_at = now(), updated_at = now()
      where id = $1 and erased_at is null returning ${COLUMNS}`,
    [id, status],
  );
  return row ? toOrder(row) : null;
}

export async function updateOrderStaff(
  id: number,
  input: { deliverOn: string; timeSlot: TimeSlot; deliveryCents: number; staffNote: string | null; bakeryId: number },
): Promise<void> {
  await getDb().query(
    `update orders
        set deliver_on = $2::date, time_slot = $3, delivery_cents = $4, staff_note = $5, bakery_id = $6, updated_at = now()
      where id = $1 and erased_at is null`,
    [id, input.deliverOn, input.timeSlot, input.deliveryCents, input.staffNote, input.bakeryId],
  );
}

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------

export async function setCheckoutSession(id: number, sessionId: string): Promise<void> {
  await getDb().query(
    `update orders set stripe_session_id = $2, payment_status = 'pendiente', updated_at = now()
      where id = $1 and payment_status in ('pendiente', 'caducado')`,
    [id, sessionId],
  );
}

/**
 * Records a completed payment. Only moves an unpaid order, so the webhook and
 * the return from Stripe can both call it and the second does nothing.
 * Returns the order when this call is the one that marked it paid.
 */
export async function markOrderPaid(
  id: number,
  input: { sessionId: string; paymentIntent: string | null; amountCents: number },
): Promise<Order | null> {
  const row = await one<OrderRow>(
    getDb(),
    `update orders
        set payment_status = 'pagado', paid_cents = $4, paid_at = now(), stripe_session_id = $2,
            stripe_payment_intent = $3, updated_at = now()
      where id = $1 and payment_method = 'stripe' and payment_status in ('pendiente', 'caducado')
      returning ${COLUMNS}`,
    [id, input.sessionId, input.paymentIntent, input.amountCents],
  );
  return row ? toOrder(row) : null;
}

/** A payment page that expired or failed: only if it is still the order's current one. */
export async function markCheckoutAbandoned(id: number, sessionId: string): Promise<boolean> {
  const { rowCount } = await getDb().query(
    `update orders set payment_status = 'caducado', updated_at = now()
      where id = $1 and stripe_session_id = $2 and payment_status = 'pendiente'`,
    [id, sessionId],
  );
  return rowCount === 1;
}

/** Transfer orders (company birthdays): the team marks them paid or not. */
export async function setManualPayment(id: number, paid: boolean): Promise<Order | null> {
  const row = await one<OrderRow>(
    getDb(),
    `update orders
        set payment_status = case when $2 then 'pagado' else 'pendiente' end,
            paid_cents = case when $2 then total_cents else 0 end,
            paid_at = case when $2 then now() else null end, updated_at = now()
      where id = $1 and payment_method = 'transferencia' and erased_at is null
      returning ${COLUMNS}`,
    [id, paid],
  );
  return row ? toOrder(row) : null;
}

/** Adds a refund made through us; the status follows how much of the payment has gone back. */
export async function recordRefund(id: number, amountCents: number): Promise<Order | null> {
  const row = await one<OrderRow>(
    getDb(),
    `update orders
        set refunded_cents = least(paid_cents, refunded_cents + $2),
            payment_status = case when refunded_cents + $2 >= paid_cents then 'reembolsado' else 'parcial' end,
            refunded_at = now(), updated_at = now()
      where id = $1 and payment_status in ('pagado', 'parcial')
      returning ${COLUMNS}`,
    [id, amountCents],
  );
  return row ? toOrder(row) : null;
}

/**
 * The refunded total as Stripe reports it (a refund made in Stripe's own
 * dashboard arrives this way). Never lowers what we already know.
 */
export async function syncRefundedTotal(paymentIntent: string, refundedCents: number): Promise<Order | null> {
  const row = await one<OrderRow>(
    getDb(),
    `update orders
        set refunded_cents = least(paid_cents, greatest(refunded_cents, $2)),
            payment_status = case when greatest(refunded_cents, $2) >= paid_cents then 'reembolsado'
                                  when greatest(refunded_cents, $2) > 0 then 'parcial' else payment_status end,
            refunded_at = coalesce(refunded_at, now()), updated_at = now()
      where stripe_payment_intent = $1 and payment_status in ('pagado', 'parcial', 'reembolsado')
        and greatest(refunded_cents, $2) > refunded_cents
      returning ${COLUMNS}`,
    [paymentIntent, refundedCents],
  );
  return row ? toOrder(row) : null;
}

// ---------------------------------------------------------------------------
// The photo
// ---------------------------------------------------------------------------

export async function saveOrderPhoto(orderId: number, mime: string, bytes: Buffer, db: Db = getDb()): Promise<void> {
  await db.query(
    `insert into order_photos (order_id, mime, bytes) values ($1, $2, $3)
     on conflict (order_id) do update set mime = excluded.mime, bytes = excluded.bytes, created_at = now()`,
    [orderId, mime, bytes],
  );
  await db.query('update orders set has_photo = true where id = $1', [orderId]);
}

export async function getOrderPhoto(orderId: number): Promise<{ mime: string; bytes: Buffer } | null> {
  const row = await one<{ mime: string; bytes: Buffer | Uint8Array }>(
    getDb(),
    'select mime, bytes from order_photos where order_id = $1',
    [orderId],
  );
  return row ? { mime: row.mime, bytes: Buffer.from(row.bytes) } : null;
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

/** Personal data out; the row stays for the books (what, when, how much). */
export async function eraseOrder(id: number): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    await tx.query('delete from order_photos where order_id = $1', [id]);
    const { rowCount } = await tx.query(
      `update orders
          set recipient_name = null, recipient_company = null, recipient_phone = null, address = null,
              postal_code = null, delivery_notes = null, allergies = null, cake_text = null, card_message = null,
              sign_off = null, sender_name = null, sender_phone = null, sender_email = null, sender_company = null,
              staff_note = null, ip_hash = null, has_photo = false, erased_at = now(), updated_at = now()
        where id = $1 and erased_at is null`,
      [id],
    );
    return rowCount === 1;
  });
}

/** Finished orders (delivered or cancelled) whose delivery day is more than `days` ago. */
export async function findOrdersToErase(days: number, today: string): Promise<number[]> {
  const { rows } = await getDb().query<{ id: number }>(
    `select id from orders
      where erased_at is null and status in ('entregado', 'cancelado')
        and deliver_on < $2::date - $1::int`,
    [days, today],
  );
  return rows.map((r) => r.id);
}

/**
 * Web orders whose payment never happened, older than `days`: they never
 * became orders, so they go entirely (photo included, by cascade).
 */
export async function deleteAbandonedOrders(days: number): Promise<number> {
  const { rowCount } = await getDb().query(
    `delete from orders
      where payment_method = 'stripe' and payment_status in ('pendiente', 'caducado')
        and paid_cents = 0 and created_at < now() - make_interval(days => $1)`,
    [days],
  );
  return rowCount;
}

export async function recordStripeEvent(id: string, type: string): Promise<void> {
  await getDb().query('insert into stripe_events (id, type) values ($1, $2) on conflict (id) do nothing', [id, type]);
}

export async function stripeEventSeen(id: string): Promise<boolean> {
  return (await one(getDb(), 'select 1 from stripe_events where id = $1', [id])) !== null;
}

export async function pruneStripeEvents(days: number): Promise<number> {
  const { rowCount } = await getDb().query('delete from stripe_events where received_at < now() - make_interval(days => $1)', [days]);
  return rowCount;
}

export async function recordMarketingConsent(input: { email: string; name: string | null; consentText: string }): Promise<void> {
  await getDb().query(
    `insert into marketing_contacts (email, name, consent_text)
     values ($1, $2, $3)
     on conflict (lower(email)) do update
        set name = coalesce(excluded.name, marketing_contacts.name), consent_text = excluded.consent_text,
            consented_at = now(), withdrawn_at = null`,
    [input.email, input.name, input.consentText],
  );
}
