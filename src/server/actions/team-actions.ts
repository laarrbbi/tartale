'use server';

import { revalidatePath } from 'next/cache';

import { revokeAllSessions } from '@/server/auth/session';
import { recordAudit } from '@/server/repositories/audit';
import {
  countActiveOwners,
  createUser,
  disableTotp,
  findUserByEmail,
  findUserById,
  setAccountActive,
  setTemporaryPassword,
} from '@/server/repositories/users';
import { generateTemporaryPassword, hashPassword } from '@/server/security/password';
import { newAccountSchema } from '@/server/validation/panel';
import { idSchema } from '@/server/validation/schemas';

import { beginMutation, isActionState, type Begun } from './begin';
import { formFields } from './form-data';
import { fail, ok, okWithSecret, toFieldErrors, type ActionState } from './types';

/**
 * Panel accounts. Owner only. Nobody picks a password for someone else: a
 * random temporary one is shown once to the owner, who passes it on, and the
 * panel makes its holder replace it before doing anything.
 */

const PAGE = '/admin/equipo';
const ROLE_LABEL = { owner: 'propietario', staff: 'equipo' } as const;

async function audit(begun: Begun, action: string, targetId: number, detail: string) {
  await recordAudit({
    actorId: begun.session.user.id,
    actorEmail: begun.session.user.email,
    action,
    target: `account:${targetId}`,
    detail,
    ipHash: begun.ipHash,
  });
}

export async function createAccountAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const parsed = newAccountSchema.safeParse(formFields(formData, ['displayName', 'email', 'role']));
  if (!parsed.success) return fail('Revisa los datos.', toFieldErrors(parsed.error.issues));
  const { displayName, email, role } = parsed.data;
  if (await findUserByEmail(email)) return fail('Ya hay una cuenta con ese email.', { email: 'Ya existe' });

  const password = generateTemporaryPassword();
  let id: number;
  try {
    id = await createUser({ email, displayName, role, passwordHash: await hashPassword(password), mustChangePassword: true });
  } catch {
    // Two owners adding the same email at once: the unique index decides.
    return fail('Ya hay una cuenta con ese email.', { email: 'Ya existe' });
  }
  await audit(begun, 'account.create', id, `${email} (${ROLE_LABEL[role]})`);
  revalidatePath(PAGE);
  return okWithSecret(
    `Cuenta creada para ${email}. Pásale esta contraseña temporal por un canal privado: no se vuelve a mostrar, y al entrar tendrá que elegir la suya.`,
    password,
  );
}

/**
 * A forgotten password cannot be looked up (only its hash is stored), so it
 * is replaced. Every session of that account ends, a lock from failed
 * attempts lifts, and two-step verification is switched off: a lost phone and
 * a forgotten password are the same call for help.
 */
export async function resetAccountPasswordAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return fail('Esa cuenta ya no existe.');
  if (id.data === begun.session.user.id) return fail('Tu contraseña se cambia en Cuenta.');
  const target = await findUserById(id.data);
  if (!target) return fail('Esa cuenta ya no existe.');

  const password = generateTemporaryPassword();
  await setTemporaryPassword(target.id, await hashPassword(password));
  await disableTotp(target.id);
  await revokeAllSessions(target.id);
  await audit(begun, 'account.password_reset', target.id, target.email);
  revalidatePath(PAGE);
  return okWithSecret(
    `Contraseña temporal nueva para ${target.email}. No se vuelve a mostrar. Si tenía la verificación en dos pasos, queda desactivada.`,
    password,
  );
}

/** Off also ends every open session of that account: out now, not at the next timeout. */
export async function setAccountActiveAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return fail('Esa cuenta ya no existe.');
  if (id.data === begun.session.user.id) return fail('No puedes desactivar tu propia cuenta.');
  const target = await findUserById(id.data);
  if (!target) return fail('Esa cuenta ya no existe.');

  const active = formData.get('active') === 'true';
  if (!active && target.role === 'owner' && target.is_active && (await countActiveOwners()) <= 1) {
    return fail('Tiene que quedar al menos una cuenta propietaria activa.');
  }
  await setAccountActive(target.id, active);
  if (!active) await revokeAllSessions(target.id);
  await audit(begun, active ? 'account.activate' : 'account.deactivate', target.id, target.email);
  revalidatePath(PAGE);
  return ok(active ? `${target.email} puede volver a entrar.` : `${target.email} ya no puede entrar.`);
}
