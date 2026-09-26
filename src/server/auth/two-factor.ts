import 'server-only';

import { createHmac } from 'node:crypto';
import { cookies } from 'next/headers';

import { COOKIES, DEV_COOKIES, TTL } from '@/lib/constants';
import { env, isProduction } from '@/lib/env';
import { safeEqual } from '@/server/security/hash';

/**
 * The half-way state of a two-step login: "this browser gave the right
 * password for account N a few minutes ago". Signed rather than stored, so a
 * password spray cannot fill a table; short-lived, and it grants nothing but
 * the chance to type a code.
 */
const NAME = (isProduction ? COOKIES : DEV_COOKIES).twoFactor;

function sign(payload: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(`2fa:${payload}`).digest('base64url');
}

export async function startTwoFactor(userId: number): Promise<void> {
  const payload = `${userId}.${Date.now() + TTL.twoFactorPending * 1000}`;
  (await cookies()).set(NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: TTL.twoFactorPending,
  });
}

/** The account waiting for its code, or null if none or expired. */
export async function pendingTwoFactor(): Promise<number | null> {
  const raw = (await cookies()).get(NAME)?.value;
  if (!raw) return null;
  const [id, expires, mac] = raw.split('.');
  if (!id || !expires || !mac || !safeEqual(mac, sign(`${id}.${expires}`))) return null;
  if (Number(expires) < Date.now()) return null;
  const userId = Number(id);
  return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
}

export async function clearTwoFactor(): Promise<void> {
  (await cookies()).set(NAME, '', { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/', maxAge: 0 });
}
