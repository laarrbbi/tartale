import 'server-only';

import { CSRF_FIELD, assertCsrf } from '@/server/auth/csrf';
import type { ActiveSession } from '@/server/auth/session';
import { hashIp } from '@/server/security/hash';
import { RULES, consume } from '@/server/security/rate-limit';
import { getClientIp } from '@/server/security/request';
import type { Role } from '@/types/domain';

import { fail, type ActionState } from './types';

export interface Begun {
  session: ActiveSession;
  ipHash: string | null;
}

/**
 * The preamble every panel mutation runs before touching anything:
 *  1. CSRF: same origin, and the session's own token in the form.
 *  2. Role: some actions are owner-only. Checked here, not by hiding the
 *     button: a server action is an HTTP endpoint anyone can call.
 *  3. A temporary password must be changed first.
 *  4. Rate limit: caps what a script could do with a stolen session cookie.
 */
export async function beginMutation(formData: FormData, options: { requireRole?: Role } = {}): Promise<Begun | ActionState> {
  let session: ActiveSession;
  try {
    session = await assertCsrf(formData.get(CSRF_FIELD)?.toString());
  } catch {
    return fail('Tu sesión ha caducado. Vuelve a entrar.');
  }
  if (options.requireRole && session.user.role !== options.requireRole) {
    return fail('Esto solo lo puede hacer la persona propietaria de la cuenta.');
  }
  if (session.user.mustChangePassword) {
    return fail('Primero cambia tu contraseña temporal (Cuenta).');
  }
  if (!(await consume(RULES.adminWrite, String(session.user.id))).allowed) {
    return fail('Demasiados cambios seguidos. Ve un poco más despacio.');
  }
  return { session, ipHash: hashIp(await getClientIp()) };
}

export function isActionState(value: unknown): value is ActionState {
  return typeof value === 'object' && value !== null && 'status' in value;
}
