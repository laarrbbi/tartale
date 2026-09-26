import 'server-only';

import { headers } from 'next/headers';

import { env } from '@/lib/env';

/**
 * Best-effort client address. `X-Forwarded-For` is attacker-controlled unless
 * a trusted proxy overwrites it, so it is only read with TRUST_PROXY_HEADERS=1.
 * On Vercel the platform sets `x-vercel-forwarded-for`, which a client cannot
 * spoof. Getting this wrong turns every rate limit into a no-op.
 */
export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  if (env.TRUST_PROXY_HEADERS) {
    const first = h.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (first) return first;
    const real = h.get('x-real-ip')?.trim();
    if (real) return real;
  }
  return h.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() || null;
}

export async function getUserAgent(): Promise<string | null> {
  return (await headers()).get('user-agent');
}

/**
 * Same-origin check, the first CSRF defence on every POST. `Origin` is set by
 * the browser and cannot be forged by page script; a request with neither
 * Origin nor Referer is refused too, since browser form posts carry one.
 */
export function originMatches(origin: string | null, referer: string | null, appOrigin: string): boolean {
  if (origin) return origin === appOrigin;
  if (referer) {
    try {
      return new URL(referer).origin === appOrigin;
    } catch {
      return false;
    }
  }
  return false;
}

export async function isSameOrigin(): Promise<boolean> {
  const h = await headers();
  return originMatches(h.get('origin'), h.get('referer'), env.APP_ORIGIN);
}
