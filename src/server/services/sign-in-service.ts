import 'server-only';

import type { ProviderId, ReturnPath, SignInErrorCode } from '@/lib/accounts';
import {
  appleNameFromForm,
  authorizationRequest,
  exchangeCode,
  openPending,
  sealPending,
  verifyIdToken,
  type VerifiedIdentity,
} from '@/server/auth/oidc';
import { getDb } from '@/server/db/pg';
import {
  createCustomer,
  customerForIdentity,
  customerWithVerifiedEmail,
  linkIdentity,
  recordSignIn,
} from '@/server/repositories/customers';
import { safeEqual } from '@/server/security/hash';

/** Leaving for the provider: where to send the person, and the signed cookie that remembers this attempt. */
export function startSignIn(provider: ProviderId, returnTo: ReturnPath, now: number = Date.now()): { url: string; cookieValue: string } {
  const { url, pending } = authorizationRequest(provider, returnTo, now);
  return { url, cookieValue: sealPending(pending) };
}

export type SignInOutcome =
  | { ok: true; customerId: number; returnTo: ReturnPath }
  | { ok: false; error: SignInErrorCode; returnTo: ReturnPath };

/** Provider authorization codes are opaque; Microsoft's run to a couple of kilobytes. */
const MAX_CODE_LENGTH = 4096;

/**
 * Coming back from the provider. `params` is the query string (Google,
 * Microsoft) or the form Apple posts; `pendingCookie` is what `startSignIn`
 * left in this browser. Every failure reads the same to the person; the log
 * gets the reason.
 */
export async function finishSignIn(input: {
  provider: ProviderId;
  params: URLSearchParams;
  pendingCookie: string | undefined;
  now?: number;
}): Promise<SignInOutcome> {
  const now = input.now ?? Date.now();
  const pending = openPending(input.pendingCookie, now);
  const returnTo = pending?.returnTo ?? '/cuenta';
  const fail = (error: SignInErrorCode): SignInOutcome => ({ ok: false, error, returnTo });

  // "Cancel" on the provider's page, or a refusal: nothing to check.
  if (input.params.has('error')) return fail('cancelado');

  // The cookie proves this browser started this sign-in, with this provider.
  // Without it (expired, another tab, or someone else's link), stop here.
  if (!pending || pending.provider !== input.provider) return fail('caducado');
  if (!safeEqual(input.params.get('state') ?? '', pending.state)) return fail('caducado');

  const code = input.params.get('code') ?? '';
  if (code === '' || code.length > MAX_CODE_LENGTH) return fail('fallo');

  try {
    const idToken = await exchangeCode(input.provider, code, pending.verifier, now);
    const identity = await verifyIdToken(input.provider, idToken, pending.nonce, now);
    const name = identity.name ?? (input.provider === 'apple' ? appleNameFromForm(input.params.get('user')) : null);
    const customerId = await customerForSignIn({ ...identity, name });
    return { ok: true, customerId, returnTo: pending.returnTo };
  } catch (error) {
    console.error(`[sign-in] ${input.provider}:`, error instanceof Error ? error.message : 'failed');
    return fail('fallo');
  }
}

class LostRace extends Error {}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505';
}

/**
 * The account for this sign-in:
 *  1. The one this provider id already belongs to.
 *  2. Else, when the provider vouches for the email address, the account an
 *     earlier vouched-for sign-in gave that same address: Google and Apple
 *     with one address are one account. An account whose address nobody
 *     vouched for is never joined this way.
 *  3. Else a new one.
 * Two first sign-ins at the same moment race for the unique indexes; the
 * loser looks again and finds the winner's account.
 */
export async function customerForSignIn(identity: VerifiedIdentity): Promise<number> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getDb().transaction(async (tx) => {
        const known = await customerForIdentity(identity.provider, identity.subject, tx);
        if (known !== null) {
          await recordSignIn({ ...identity, customerId: known }, tx);
          return known;
        }
        const sameEmail =
          identity.emailVerified && identity.email ? await customerWithVerifiedEmail(identity.email, tx) : null;
        const customerId =
          sameEmail ?? (await createCustomer({ email: identity.email, emailVerified: identity.emailVerified, name: identity.name }, tx));
        if (!(await linkIdentity({ provider: identity.provider, subject: identity.subject, customerId, email: identity.email }, tx))) {
          throw new LostRace();
        }
        await recordSignIn({ ...identity, customerId }, tx);
        return customerId;
      });
    } catch (error) {
      if (attempt === 0 && (error instanceof LostRace || isUniqueViolation(error))) continue;
      throw error;
    }
  }
}
