import 'server-only';

import { getDb, one } from '@/server/db/pg';

export interface RateLimitRule {
  /** Namespace so two features never share a counter. */
  readonly name: string;
  /** Maximum hits inside one window. */
  readonly limit: number;
  /** Window length in seconds. */
  readonly windowSeconds: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  /** Unix seconds at which the window rolls over. */
  readonly resetAt: number;
}

/**
 * Per-IP (or per-account) budgets, counted in the database so every
 * serverless instance shares them.
 *
 *  - `order`      — placing an order. Each one stores two people's details and
 *                   opens a payment; nobody legitimately places ten in ten
 *                   minutes from one connection.
 *  - `payment`    — reopening the payment page for an unpaid order.
 *  - `invoice`    — a customer asking for an invoice in their company's name:
 *                   once per order is the norm, a typo or two the most.
 *  - `tracking`   — reading a tracking page or its photo. The link cannot be
 *                   guessed (128 bits); this only caps the database load a
 *                   script could cause.
 *  - `login`      — password guessing per IP; the per-account lockout covers
 *                   many IPs converging on one account.
 *  - `adminWrite` — blast-radius cap on a stolen admin session.
 *  - `signIn`     — leaving for, and coming back from, Google, Apple or
 *                   Microsoft. Each sign-in counts twice; an office behind
 *                   one address still has room for a dozen people at once.
 *  - `customerWrite` — the same cap as `adminWrite`, on a customer's account.
 */
export const RULES = {
  order: { name: 'order', limit: 8, windowSeconds: 60 * 10 },
  payment: { name: 'payment', limit: 12, windowSeconds: 60 * 10 },
  invoice: { name: 'invoice', limit: 6, windowSeconds: 60 * 10 },
  tracking: { name: 'tracking', limit: 240, windowSeconds: 60 * 10 },
  login: { name: 'login', limit: 10, windowSeconds: 60 * 15 },
  adminWrite: { name: 'admin-write', limit: 120, windowSeconds: 60 * 5 },
  signIn: { name: 'sign-in', limit: 30, windowSeconds: 60 * 10 },
  customerWrite: { name: 'customer-write', limit: 30, windowSeconds: 60 * 5 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Fixed-window counter in one atomic upsert: two concurrent requests cannot
 * both read the same count and both decide they are under the limit. A fixed
 * window can let through up to twice the limit across a boundary, which is an
 * accepted trade for abuse prevention (not billing).
 */
export async function consume(rule: RateLimitRule, identifier: string): Promise<RateLimitResult> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % rule.windowSeconds);

  const row = await one<{ hits: number }>(
    db,
    `insert into rate_limits (bucket_key, window_start, hits)
     values ($1, $2, 1)
     on conflict (bucket_key, window_start)
     do update set hits = rate_limits.hits + 1
     returning hits`,
    [`${rule.name}:${identifier}`, windowStart],
  );
  const hits = row?.hits ?? 1;

  return {
    allowed: hits <= rule.limit,
    remaining: Math.max(0, rule.limit - hits),
    resetAt: windowStart + rule.windowSeconds,
  };
}

/** All clients whose address is unknown share one budget. */
export const ANONYMOUS_BUCKET = 'unknown';

/** Housekeeping: windows long gone. */
export async function pruneRateLimits(): Promise<number> {
  const { rowCount } = await getDb().query('delete from rate_limits where window_start < $1', [
    Math.floor(Date.now() / 1000) - 60 * 60 * 24,
  ]);
  return rowCount;
}
