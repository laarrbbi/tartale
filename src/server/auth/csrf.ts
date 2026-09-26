import 'server-only';

import { safeEqual } from '@/server/security/hash';
import { isSameOrigin } from '@/server/security/request';

import { getSession, type ActiveSession } from './session';

export class CsrfError extends Error {
  constructor() {
    super('Request rejected: cross-site request forgery check failed.');
    this.name = 'CsrfError';
  }
}

/**
 * Two independent checks, both required:
 *  1. Origin/Referer equals APP_ORIGIN — browsers set these and page script
 *     cannot change them, which alone stops classic form-post CSRF.
 *  2. The submitted token matches the one bound to the session — the belt to
 *     those braces, surviving a proxy that rewrites Origin.
 */
export async function assertCsrf(submittedToken: string | null | undefined): Promise<ActiveSession> {
  if (!(await isSameOrigin())) throw new CsrfError();
  const session = await getSession();
  if (!session) throw new CsrfError();
  if (!submittedToken || !safeEqual(submittedToken, session.csrfToken)) throw new CsrfError();
  return session;
}

export { CSRF_FIELD } from '@/lib/constants';
