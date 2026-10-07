import 'server-only';

import { createHmac } from 'node:crypto';

import { cookies } from 'next/headers';

import { COOKIES, DEV_COOKIES, TTL } from '@/lib/constants';
import { env, isProduction } from '@/lib/env';
import {
  findCustomerSession,
  insertCustomerSession,
  revokeCustomerSession,
  touchCustomerSession,
  type Customer,
} from '@/server/repositories/customers';
import { hashIp, hashToken, randomToken, safeEqual } from '@/server/security/hash';
import { getClientIp, getUserAgent, isSameOrigin } from '@/server/security/request';

/**
 * A customer's session: its own cookie, its own table, never the team's. A
 * customer session opens nothing in the panel, and a panel session nothing in
 * an account.
 */
export interface CustomerSession {
  readonly id: number;
  readonly customer: Customer;
  /** For the account's forms; derived from the session, so there is no second cookie to keep in step. */
  readonly csrfToken: string;
}

const NAMES = isProduction ? COOKIES : DEV_COOKIES;

export interface CookieToSet {
  name: string;
  value: string;
  options: { httpOnly: true; secure: boolean; sameSite: 'lax' | 'none'; path: '/'; maxAge: number };
}

/** Readable by nobody but the server, sent on a link from another site (Lax), withheld from cross-site POSTs. */
function sessionCookie(value: string, maxAge: number): CookieToSet {
  return { name: NAMES.customer, value, options: { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/', maxAge } };
}

/**
 * The sign-in in progress. SameSite=None because Apple brings the person back
 * with a POST from its own site, and a Lax cookie would not come along; it is
 * signed, lives ten minutes and is cleared on the way back, and it only
 * proves "this browser started this sign-in". A plain HTTP dev server cannot
 * set a None cookie, and needs none: its mock answers from the same site.
 */
export function signInCookie(value: string, maxAge: number = TTL.signIn): CookieToSet {
  return {
    name: NAMES.signIn,
    value,
    options: { httpOnly: true, secure: isProduction, sameSite: isProduction ? 'none' : 'lax', path: '/', maxAge },
  };
}

export const SIGN_IN_COOKIE = NAMES.signIn;

export function customerCsrfToken(sessionToken: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(`customer-csrf\u0000${sessionToken}`).digest('base64url');
}

/** A fresh session, after a provider vouched for the person. The caller sets the cookie on its response. */
export async function openCustomerSession(customerId: number): Promise<CookieToSet> {
  const token = randomToken();
  await insertCustomerSession({
    customerId,
    tokenHash: hashToken(token),
    ipHash: hashIp(await getClientIp()),
    userAgent: (await getUserAgent())?.slice(0, 200) ?? null,
    ttlSeconds: TTL.customerSession,
  });
  return sessionCookie(token, TTL.customerSession);
}

/** Cheap: whether the browser holds a session cookie at all, without asking the database. */
export async function hasCustomerCookie(): Promise<boolean> {
  return Boolean((await cookies()).get(NAMES.customer)?.value);
}

/** Postgres' "relation does not exist": the accounts update has not been applied yet. */
function isMissingTable(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '42P01';
}

export async function getCustomerSession(): Promise<CustomerSession | null> {
  const token = (await cookies()).get(NAMES.customer)?.value;
  if (!token || token.length > 100) return null;
  let found: Awaited<ReturnType<typeof findCustomerSession>>;
  try {
    found = await findCustomerSession(hashToken(token));
  } catch (error) {
    // A cookie with no accounts tables behind it must not break the order
    // form, the one page every visitor needs.
    if (isMissingTable(error)) return null;
    throw error;
  }
  if (!found) return null;
  if (Date.now() - new Date(found.lastSeenAt).getTime() > 60 * 60 * 1000) {
    await touchCustomerSession(found.sessionId, found.customer.id);
  }
  return { id: found.sessionId, customer: found.customer, csrfToken: customerCsrfToken(token) };
}

export class CustomerCsrfError extends Error {
  constructor() {
    super('Request rejected: cross-site request forgery check failed.');
    this.name = 'CustomerCsrfError';
  }
}

/** The same two checks as the panel's forms: same origin, and this session's own token in the form. */
export async function assertCustomerCsrf(submittedToken: string | null | undefined): Promise<CustomerSession> {
  if (!(await isSameOrigin())) throw new CustomerCsrfError();
  const session = await getCustomerSession();
  if (!session) throw new CustomerCsrfError();
  if (!submittedToken || !safeEqual(submittedToken, session.csrfToken)) throw new CustomerCsrfError();
  return session;
}

/** Signing in again ends the session this browser already had, rather than leaving it valid beside the new one. */
export async function revokeCurrentCustomerSession(): Promise<void> {
  const token = (await cookies()).get(NAMES.customer)?.value;
  if (token && token.length <= 100) await revokeCustomerSession(hashToken(token));
}

export async function closeCustomerSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(NAMES.customer)?.value;
  if (token) await revokeCustomerSession(hashToken(token));
  const expired = sessionCookie('', 0);
  jar.set(expired.name, expired.value, expired.options);
}
