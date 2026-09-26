import 'server-only';

import { env } from '@/lib/env';
import { safeEqual } from '@/server/security/hash';

/**
 * Vercel Cron calls the job routes with `Authorization: Bearer $CRON_SECRET`.
 * Without the secret set, nobody gets in: a job that erases data is not a
 * public URL.
 */
export function cronAuthorized(request: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  return safeEqual(request.headers.get('authorization') ?? '', `Bearer ${secret}`);
}
