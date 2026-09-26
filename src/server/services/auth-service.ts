import 'server-only';

import { TTL } from '@/lib/constants';
import { createSession } from '@/server/auth/session';
import { recordAudit } from '@/server/repositories/audit';
import {
  claimTotpStep,
  findUserByEmail,
  findUserById,
  getTotp,
  isLocked,
  recordFailedLogin,
  recordSuccessfulLogin,
  updatePasswordHash,
} from '@/server/repositories/users';
import { hashIp } from '@/server/security/hash';
import { hashPassword, needsRehash, verifyPassword } from '@/server/security/password';
import { ANONYMOUS_BUCKET, RULES, consume } from '@/server/security/rate-limit';
import { matchTotp } from '@/server/security/totp';

/** The account locks for TTL.loginLockout once this many attempts fail in a row. */
export const MAX_FAILED_ATTEMPTS = 8;

export type LoginResult =
  | { ok: true }
  /** Right password, and the account asks for its 6-digit code. No session yet. */
  | { ok: false; reason: 'code_required'; userId: number }
  | { ok: false; reason: 'invalid_credentials' | 'invalid_code' | 'rate_limited' | 'locked' };

/**
 * A verification against a throwaway hash, so an unknown email takes as long
 * as a wrong password: otherwise the response time says which emails exist.
 */
const DUMMY_HASH_PROMISE = hashPassword('this-hash-is-never-matched-by-any-password');

export async function login(input: { email: string; password: string; ip: string | null }): Promise<LoginResult> {
  const ipHash = hashIp(input.ip);
  if (!(await consume(RULES.login, ipHash ?? ANONYMOUS_BUCKET)).allowed) return { ok: false, reason: 'rate_limited' };

  const user = await findUserByEmail(input.email);
  if (!user || !user.is_active) {
    await verifyPassword(input.password, await DUMMY_HASH_PROMISE);
    return { ok: false, reason: 'invalid_credentials' };
  }
  if (isLocked(user)) {
    await recordAudit({ actorId: user.id, actorEmail: user.email, action: 'login.blocked_locked', ipHash });
    return { ok: false, reason: 'locked' };
  }
  if (!(await verifyPassword(input.password, user.password_hash))) {
    await recordFailedLogin(user.id, MAX_FAILED_ATTEMPTS, TTL.loginLockout);
    await recordAudit({ actorId: user.id, actorEmail: user.email, action: 'login.failed', ipHash });
    return { ok: false, reason: 'invalid_credentials' };
  }
  if (needsRehash(user.password_hash)) await updatePasswordHash(user.id, await hashPassword(input.password));

  // The failure counter is not reset yet: with the code still to pass, holding
  // the password must not buy a fresh budget of code guesses.
  if ((await getTotp(user.id))?.enabled) return { ok: false, reason: 'code_required', userId: user.id };

  return finishLogin(user, ipHash);
}

async function finishLogin(user: { id: number; email: string }, ipHash: string | null): Promise<LoginResult> {
  await recordSuccessfulLogin(user.id);
  // A brand-new session on every login: never adopt an id the client had,
  // which is what makes session fixation possible.
  await createSession(user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: 'login.success', ipHash });
  return { ok: true };
}

/**
 * The second step, for an account whose password was just accepted. A wrong
 * code costs the same as a wrong password, and a code is good once.
 */
export async function completeTwoFactor(input: { userId: number; code: string; ip: string | null }): Promise<LoginResult> {
  const ipHash = hashIp(input.ip);
  if (!(await consume(RULES.login, ipHash ?? ANONYMOUS_BUCKET)).allowed) return { ok: false, reason: 'rate_limited' };

  const user = await findUserById(input.userId);
  if (!user || !user.is_active) return { ok: false, reason: 'invalid_credentials' };
  if (isLocked(user)) return { ok: false, reason: 'locked' };

  const totp = await getTotp(user.id);
  // Switched off in the meantime (the owner reset it): the password was right.
  if (!totp?.enabled || !totp.secret) return finishLogin(user, ipHash);

  const step = matchTotp(totp.secret, input.code);
  if (step === null || !(await claimTotpStep(user.id, step))) {
    await recordFailedLogin(user.id, MAX_FAILED_ATTEMPTS, TTL.loginLockout);
    await recordAudit({ actorId: user.id, actorEmail: user.email, action: 'login.failed_code', ipHash });
    return { ok: false, reason: 'invalid_code' };
  }
  return finishLogin(user, ipHash);
}
