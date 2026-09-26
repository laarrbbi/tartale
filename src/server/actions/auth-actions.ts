'use server';

import { redirect } from 'next/navigation';

import { CSRF_FIELD, CsrfError, assertCsrf } from '@/server/auth/csrf';
import { createSession, destroySession, revokeAllSessions } from '@/server/auth/session';
import { clearTwoFactor, pendingTwoFactor, startTwoFactor } from '@/server/auth/two-factor';
import { recordAudit } from '@/server/repositories/audit';
import { findUserById, updatePasswordHash } from '@/server/repositories/users';
import { hashIp } from '@/server/security/hash';
import { hashPassword, verifyPassword } from '@/server/security/password';
import { getClientIp, isSameOrigin } from '@/server/security/request';
import { completeTwoFactor, login, type LoginResult } from '@/server/services/auth-service';
import { loginSchema, newPasswordSchema } from '@/server/validation/schemas';

import { fail, ok, type ActionState } from './types';

const GENERIC = 'Ese email y esa contraseña no funcionan.';

function failedLogin(result: Exclude<LoginResult, { ok: true }>): ActionState {
  if (result.reason === 'rate_limited') return fail('Demasiados intentos. Espera unos minutos y vuelve a probar.');
  if (result.reason === 'locked') return fail('Esta cuenta está bloqueada un rato por demasiados intentos. Vuelve a probar en 15 minutos.');
  return fail(GENERIC);
}

/**
 * The one mutation with no session to bind a CSRF token to, so it relies on
 * the Origin check. That is enough: a forged login cannot read the response,
 * and a session is minted fresh on every success, so nobody can be logged
 * into an account they did not choose.
 */
export async function loginAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isSameOrigin())) return fail('Petición rechazada.');

  // Second step: only a code is posted, for the account in the signed cookie.
  const code = formData.get('code');
  if (typeof code === 'string') {
    const userId = await pendingTwoFactor();
    if (!userId) return fail('Han pasado más de 5 minutos. Vuelve a escribir tu email y tu contraseña.');
    const result = await completeTwoFactor({ userId, code, ip: await getClientIp() });
    if (!result.ok) {
      if (result.reason === 'invalid_code') {
        return { status: 'error', message: 'Ese código no vale. Escribe el que sale ahora en la aplicación.', needsCode: true };
      }
      await clearTwoFactor();
      return failedLogin(result);
    }
    await clearTwoFactor();
    redirect('/admin');
  }

  // One message for every failure: "no such account" would hand out a list of valid emails.
  const parsed = loginSchema.safeParse({ email: formData.get('email'), password: formData.get('password') });
  if (!parsed.success) return fail(GENERIC);

  const result = await login({ ...parsed.data, ip: await getClientIp() });
  if (!result.ok) {
    if (result.reason === 'code_required') {
      await startTwoFactor(result.userId);
      return { status: 'success', message: 'Ahora escribe el código de 6 cifras de tu aplicación.', needsCode: true };
    }
    return failedLogin(result);
  }
  redirect('/admin');
}

export async function logoutAction(formData: FormData): Promise<void> {
  try {
    const session = await assertCsrf(formData.get(CSRF_FIELD)?.toString());
    await recordAudit({ actorId: session.user.id, actorEmail: session.user.email, action: 'logout', ipHash: hashIp(await getClientIp()) });
  } catch (error) {
    // A failed CSRF check still clears the cookies: refusing to log someone
    // out is worse than honouring a forged logout.
    if (!(error instanceof CsrfError)) throw error;
  }
  await destroySession();
  redirect('/admin/login');
}

/**
 * Changing one's own password. Every other session of the account ends — if
 * it was changed because it leaked, old sessions must not survive — and this
 * one is re-issued so the person stays signed in here.
 */
export async function changePasswordAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  let session;
  try {
    session = await assertCsrf(formData.get(CSRF_FIELD)?.toString());
  } catch {
    return fail('Tu sesión ha caducado. Vuelve a entrar.');
  }
  const current = String(formData.get('currentPassword') ?? '');
  const next = newPasswordSchema.safeParse(formData.get('newPassword') ?? '');
  if (!next.success) return fail('Revisa la contraseña nueva.', { newPassword: next.error.issues[0]?.message ?? 'No válida' });
  if (next.data !== formData.get('confirmPassword')) return fail('Las contraseñas no coinciden.', { confirmPassword: 'No coincide' });

  const user = await findUserById(session.user.id);
  if (!user) return fail('Tu sesión ha caducado. Vuelve a entrar.');
  if (!(await verifyPassword(current, user.password_hash))) {
    return fail('Revisa el formulario.', { currentPassword: 'Esa no es tu contraseña actual' });
  }
  if (await verifyPassword(next.data, user.password_hash)) {
    return fail('La nueva tiene que ser distinta de la actual.', { newPassword: 'Igual que la actual' });
  }

  await updatePasswordHash(user.id, await hashPassword(next.data));
  await revokeAllSessions(user.id);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: 'password.changed',
    detail: 'Sesiones en otros dispositivos cerradas',
    ipHash: hashIp(await getClientIp()),
  });
  await createSession(user.id);
  return ok('Contraseña cambiada. Se ha cerrado la sesión en los demás dispositivos.');
}
