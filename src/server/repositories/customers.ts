import 'server-only';

import type { ProviderId } from '@/lib/accounts';
import type { CakeSize, OrderStatus, PaymentStatus } from '@/lib/orders';
import { getDb, iso, isoRequired, one, type Db } from '@/server/db/pg';
import type { BillingInput } from '@/server/validation/schemas';

/**
 * Customer accounts. No passwords: Google, Apple or Microsoft vouch for the
 * person, and we keep their id with that provider, the email address it gave
 * us, and whatever details the customer chooses to save for their next order.
 */
export interface Customer {
  id: number;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  phone: string | null;
  company: string | null;
  createdAt: string;
}

interface CustomerRow {
  id: number;
  email: string | null;
  email_verified: boolean;
  name: string | null;
  phone: string | null;
  company: string | null;
  created_at: Date | string;
}

const CUSTOMER_COLUMNS = 'c.id, c.email, c.email_verified, c.name, c.phone, c.company, c.created_at';

function toCustomer(r: CustomerRow): Customer {
  return {
    id: r.id,
    email: r.email,
    emailVerified: r.email_verified,
    name: r.name,
    phone: r.phone,
    company: r.company,
    createdAt: isoRequired(r.created_at),
  };
}

/**
 * Whether this database has the accounts tables yet: the owner applies the
 * update from Ajustes, and until then sign-in is simply not offered.
 */
export async function customerAccountsReady(db: Db = getDb()): Promise<boolean> {
  const row = await one<{ ready: boolean }>(
    db,
    `select to_regclass('public.customer_sessions') is not null
        and exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'orders' and column_name = 'customer_id') as ready`,
  );
  return row?.ready ?? false;
}

export async function getCustomer(id: number, db: Db = getDb()): Promise<Customer | null> {
  const row = await one<CustomerRow>(db, `select ${CUSTOMER_COLUMNS} from customers c where c.id = $1`, [id]);
  return row ? toCustomer(row) : null;
}

export async function customerForIdentity(provider: ProviderId, subject: string, db: Db = getDb()): Promise<number | null> {
  const row = await one<{ customer_id: number }>(
    db,
    'select customer_id from customer_identities where provider = $1 and subject = $2',
    [provider, subject],
  );
  return row?.customer_id ?? null;
}

/** The account holding this address, only when an earlier sign-in proved it is theirs. */
export async function customerWithVerifiedEmail(email: string, db: Db = getDb()): Promise<number | null> {
  const row = await one<{ id: number }>(db, 'select id from customers where lower(email) = lower($1) and email_verified', [email]);
  return row?.id ?? null;
}

export async function createCustomer(
  input: { email: string | null; emailVerified: boolean; name: string | null },
  db: Db = getDb(),
): Promise<number> {
  const row = await one<{ id: number }>(
    db,
    'insert into customers (email, email_verified, name) values ($1, $2, $3) returning id',
    [input.email, input.emailVerified && input.email !== null, input.name],
  );
  if (!row) throw new Error('customer not created');
  return row.id;
}

/** Joins a provider's id to an account. False when that id is already joined (to this one or another). */
export async function linkIdentity(
  input: { provider: ProviderId; subject: string; customerId: number; email: string | null },
  db: Db = getDb(),
): Promise<boolean> {
  const { rowCount } = await db.query(
    `insert into customer_identities (provider, subject, customer_id, email) values ($1, $2, $3, $4)
     on conflict (provider, subject) do nothing`,
    [input.provider, input.subject, input.customerId, input.email],
  );
  return rowCount > 0;
}

/** After each sign-in: when, and the address the provider gave this time. The name only fills a gap. */
export async function recordSignIn(
  input: { provider: ProviderId; subject: string; customerId: number; email: string | null; name: string | null },
  db: Db = getDb(),
): Promise<void> {
  await db.query(
    'update customer_identities set last_used_at = now(), email = coalesce($3, email) where provider = $1 and subject = $2',
    [input.provider, input.subject, input.email],
  );
  await db.query('update customers set last_seen_at = now(), name = coalesce(name, $2) where id = $1', [input.customerId, input.name]);
}

export interface CustomerIdentity {
  provider: ProviderId;
  email: string | null;
  createdAt: string;
}

export async function listIdentities(customerId: number): Promise<CustomerIdentity[]> {
  const { rows } = await getDb().query<{ provider: ProviderId; email: string | null; created_at: Date | string }>(
    'select provider, email, created_at from customer_identities where customer_id = $1 order by created_at',
    [customerId],
  );
  return rows.map((r) => ({ provider: r.provider, email: r.email, createdAt: isoRequired(r.created_at) }));
}

export interface CustomerDetails {
  name: string;
  phone: string | null;
  company: string | null;
}

export async function saveCustomerDetails(customerId: number, details: CustomerDetails, db: Db = getDb()): Promise<void> {
  await db.query('update customers set name = $2, phone = $3, company = $4 where id = $1', [
    customerId,
    details.name,
    details.phone,
    details.company,
  ]);
}

export async function getCustomerBilling(customerId: number, db: Db = getDb()): Promise<BillingInput | null> {
  const row = await one<{ name: string; tax_id: string; address: string; postal_code: string; city: string }>(
    db,
    'select name, tax_id, address, postal_code, city from customer_billing where customer_id = $1',
    [customerId],
  );
  return row ? { name: row.name, taxId: row.tax_id, address: row.address, postalCode: row.postal_code, city: row.city } : null;
}

/** Saves, or with null forgets, the fiscal details offered on the next order. */
export async function saveCustomerBilling(customerId: number, billing: BillingInput | null, db: Db = getDb()): Promise<void> {
  if (!billing) {
    await db.query('delete from customer_billing where customer_id = $1', [customerId]);
    return;
  }
  await db.query(
    `insert into customer_billing (customer_id, name, tax_id, address, postal_code, city) values ($1, $2, $3, $4, $5, $6)
     on conflict (customer_id) do update
       set name = excluded.name, tax_id = excluded.tax_id, address = excluded.address,
           postal_code = excluded.postal_code, city = excluded.city, updated_at = now()`,
    [customerId, billing.name, billing.taxId, billing.address, billing.postalCode, billing.city],
  );
}

/**
 * Deletes the account: its sign-ins, sessions and saved details go with it
 * (on delete cascade); its orders stay, unlinked, and follow the order rules.
 */
export async function deleteCustomer(customerId: number): Promise<boolean> {
  const { rowCount } = await getDb().query('delete from customers where id = $1', [customerId]);
  return rowCount > 0;
}

export async function linkOrderToCustomer(orderId: number, customerId: number, db: Db = getDb()): Promise<void> {
  await db.query('update orders set customer_id = $2 where id = $1', [orderId, customerId]);
}

export interface CustomerOrder {
  publicId: string;
  cakeName: string;
  size: CakeSize;
  deliverOn: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  totalCents: number;
  refundedCents: number;
  recipientName: string | null;
  recipientCompany: string | null;
  erased: boolean;
  createdAt: string;
}

/** The account's orders, newest first. After the order rules erase the people in one, only what, when and how much is left. */
export async function listCustomerOrders(customerId: number, limit = 50): Promise<CustomerOrder[]> {
  const { rows } = await getDb().query<{
    public_id: string;
    cake_name: string;
    size: CakeSize;
    deliver_on: string;
    status: OrderStatus;
    payment_status: PaymentStatus;
    total_cents: number;
    refunded_cents: number;
    recipient_name: string | null;
    recipient_company: string | null;
    erased_at: Date | string | null;
    created_at: Date | string;
  }>(
    `select public_id, cake_name, size, deliver_on, status, payment_status, total_cents, refunded_cents,
            recipient_name, recipient_company, erased_at, created_at
       from orders where customer_id = $1
      order by created_at desc
      limit $2`,
    [customerId, limit],
  );
  return rows.map((r) => ({
    publicId: r.public_id,
    cakeName: r.cake_name,
    size: r.size,
    deliverOn: r.deliver_on,
    status: r.status,
    paymentStatus: r.payment_status,
    totalCents: r.total_cents,
    refundedCents: r.refunded_cents,
    recipientName: r.recipient_name,
    recipientCompany: r.recipient_company,
    erased: r.erased_at !== null,
    createdAt: isoRequired(r.created_at),
  }));
}

export async function countCustomers(): Promise<number> {
  return (await one<{ c: number }>(getDb(), 'select count(*)::int as c from customers'))?.c ?? 0;
}

/** Retention: accounts nobody has signed in to for `days` days. */
export async function deleteInactiveCustomers(days: number): Promise<number> {
  const { rowCount } = await getDb().query(
    `delete from customers where last_seen_at < now() - make_interval(days => $1)`,
    [days],
  );
  return rowCount;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export interface CustomerSessionRow {
  sessionId: number;
  lastSeenAt: string;
  customer: Customer;
}

export async function insertCustomerSession(
  input: { customerId: number; tokenHash: string; ipHash: string | null; userAgent: string | null; ttlSeconds: number },
  db: Db = getDb(),
): Promise<void> {
  // The database computes the expiry, as for the team's sessions.
  await db.query(
    `insert into customer_sessions (customer_id, token_hash, ip_hash, user_agent, expires_at)
     values ($1, $2, $3, $4, now() + make_interval(secs => $5))`,
    [input.customerId, input.tokenHash, input.ipHash, input.userAgent, input.ttlSeconds],
  );
}

/** A live session for this token: not expired, not revoked. */
export async function findCustomerSession(tokenHash: string, db: Db = getDb()): Promise<CustomerSessionRow | null> {
  const row = await one<CustomerRow & { session_id: number; last_seen_at: Date | string }>(
    db,
    `select s.id as session_id, s.last_seen_at, ${CUSTOMER_COLUMNS}
       from customer_sessions s
       join customers c on c.id = s.customer_id
      where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()`,
    [tokenHash],
  );
  if (!row) return null;
  return { sessionId: row.session_id, lastSeenAt: iso(row.last_seen_at) ?? '', customer: toCustomer(row) };
}

/** At most once an hour per session: every page view would otherwise be a write. */
export async function touchCustomerSession(sessionId: number, customerId: number, db: Db = getDb()): Promise<void> {
  await db.query('update customer_sessions set last_seen_at = now() where id = $1', [sessionId]);
  await db.query('update customers set last_seen_at = now() where id = $1', [customerId]);
}

export async function revokeCustomerSession(tokenHash: string, db: Db = getDb()): Promise<void> {
  await db.query('update customer_sessions set revoked_at = now() where token_hash = $1 and revoked_at is null', [tokenHash]);
}

export async function pruneCustomerSessions(db: Db = getDb()): Promise<number> {
  const { rowCount } = await db.query(
    `delete from customer_sessions
      where expires_at < now()
         or (revoked_at is not null and revoked_at < now() - interval '30 days')`,
  );
  return rowCount;
}
