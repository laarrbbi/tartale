import 'server-only';

import { LIMITS } from '@/lib/constants';
import { countUsers, createUser, recoverOwner } from '@/server/repositories/users';
import { hashPassword } from '@/server/security/password';

/**
 * Creates the first owner account from the hosting dashboard, so a fresh
 * deployment is not a site nobody can sign into. Three guards:
 *
 *  · only when there are zero accounts — it can never overwrite a password
 *    or resurrect an account deleted on purpose;
 *  · only when BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are both set;
 *  · the same password floor as everywhere else.
 *
 * BOOTSTRAP_ADMIN_FORCE=1 is the recovery path (locked out, or password
 * lost): it makes that email an active owner with that password. Remove it as
 * soon as you are in, or every cold start resets the password.
 */
export async function bootstrapFirstAdmin(): Promise<void> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) return;

  if (password.length < LIMITS.passwordMinLength) {
    console.error(`[bootstrap] BOOTSTRAP_ADMIN_PASSWORD is shorter than ${LIMITS.passwordMinLength} characters. No account created.`);
    return;
  }
  const displayName = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || email.split('@')[0] || 'Admin';

  if (process.env.BOOTSTRAP_ADMIN_FORCE?.trim() === '1') {
    const outcome = await recoverOwner({ email, displayName, passwordHash: await hashPassword(password) });
    console.warn(`[bootstrap] BOOTSTRAP_ADMIN_FORCE: ${outcome} ${email}. Remove BOOTSTRAP_ADMIN_FORCE now.`);
    return;
  }

  if ((await countUsers()) > 0) return;
  await createUser({ email, displayName, role: 'owner', passwordHash: await hashPassword(password) });
  // The email, never the password: this line lands in a log viewer.
  console.log(`[bootstrap] Created the first owner account: ${email}.`);
}
