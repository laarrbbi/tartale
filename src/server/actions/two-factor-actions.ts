'use server';

import { revalidatePath } from 'next/cache';

import { createSession, revokeAllSessions } from '@/server/auth/session';
import { recordAudit } from '@/server/repositories/audit';
import { claimTotpStep, disableTotp, enableTotp, getTotp, setPendingTotp } from '@/server/repositories/users';
import { generateTotpSecret, matchTotp } from '@/server/security/totp';

import { beginMutation, isActionState } from './begin';
import { fail, ok, type ActionState } from './types';

const PAGE = '/admin/cuenta';

/** Step 1: a new secret, stored but not in force until a code from it is confirmed. */
export async function startTwoFactorAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData);
  if (isActionState(begun)) return begun;
  const totp = await getTotp(begun.session.user.id);
  if (totp?.enabled) return fail('Ya la tienes activada.');
  await setPendingTotp(begun.session.user.id, generateTotpSecret());
  revalidatePath(PAGE);
  return ok('Escanea el código con la aplicación.');
}

/**
 * Step 2: the first code proves the phone and the server agree; only then is
 * it switched on, so a secret nobody managed to scan cannot lock anyone out.
 */
export async function confirmTwoFactorAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData);
  if (isActionState(begun)) return begun;
  const { user } = begun.session;
  const totp = await getTotp(user.id);
  if (totp?.enabled) return ok('Ya está activada.');
  if (!totp?.secret) return fail('Pulsa «Activar» para empezar.');

  const step = matchTotp(totp.secret, String(formData.get('code') ?? ''));
  if (step === null) return fail('Ese código no coincide. Escribe el que sale ahora en la aplicación.', { code: 'Código no válido' });

  await enableTotp(user.id, step);
  await revokeAllSessions(user.id);
  await createSession(user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: 'totp.enabled', ipHash: begun.ipHash });
  revalidatePath(PAGE);
  return ok('Activada. A partir de ahora, al entrar te pediremos también el código.');
}

export async function cancelTwoFactorAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData);
  if (isActionState(begun)) return begun;
  const totp = await getTotp(begun.session.user.id);
  if (totp && !totp.enabled) await disableTotp(begun.session.user.id);
  revalidatePath(PAGE);
  return ok('Cancelado.');
}

/** Switching it off asks for a current code: an open session alone must not be enough. */
export async function disableTwoFactorAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData);
  if (isActionState(begun)) return begun;
  const { user } = begun.session;
  const totp = await getTotp(user.id);
  if (!totp?.enabled || !totp.secret) return ok('No estaba activada.');
  const step = matchTotp(totp.secret, String(formData.get('code') ?? ''));
  if (step === null || !(await claimTotpStep(user.id, step))) {
    return fail('Ese código no vale. Escribe el que sale ahora en la aplicación.', { code: 'Código no válido' });
  }
  await disableTotp(user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: 'totp.disabled', ipHash: begun.ipHash });
  revalidatePath(PAGE);
  return ok('Desactivada. Para entrar vuelve a bastar la contraseña.');
}
