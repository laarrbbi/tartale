'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { longDate } from '@/lib/dates';
import { plural } from '@/lib/format';
import { recordAudit } from '@/server/repositories/audit';
import {
  deleteBirthday,
  deleteCompany,
  findBirthday,
  findCompany,
  insertBirthdays,
  insertCompany,
  setBirthdayActive,
  updateBirthday,
  updateCompany,
} from '@/server/repositories/birthdays';
import { findCake } from '@/server/repositories/catalog';
import { createBirthdayOrderNow } from '@/server/services/birthday-service';
import { birthdayImportSchema, birthdaySchema, companySchema } from '@/server/validation/panel';
import { idSchema } from '@/server/validation/schemas';

import { beginMutation, isActionState, type Begun } from './begin';
import { formFields } from './form-data';
import { fail, ok, toFieldErrors, type ActionState } from './types';

/**
 * Company birthdays: the companies that pay, and their team lists. Owner only.
 * The audit log gets ids and counts, never the people on the lists.
 */

async function audit(begun: Begun, action: string, target: string, detail: string | null) {
  await recordAudit({
    actorId: begun.session.user.id,
    actorEmail: begun.session.user.email,
    action,
    target,
    detail,
    ipHash: begun.ipHash,
  });
}

function revalidate(companyId?: number) {
  revalidatePath('/admin/cumpleanos');
  if (companyId) revalidatePath(`/admin/cumpleanos/${companyId}`);
}

const COMPANY_FIELDS = ['name', 'contactName', 'contactPhone', 'contactEmail', 'billingNotes'] as const;

export async function createCompanyAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const parsed = companySchema.safeParse(formFields(formData, COMPANY_FIELDS));
  if (!parsed.success) return fail('Revisa los datos.', toFieldErrors(parsed.error.issues));
  const id = await insertCompany(parsed.data);
  await audit(begun, 'company.create', `company:${id}`, parsed.data.name);
  revalidate();
  redirect(`/admin/cumpleanos/${id}`);
}

export async function updateCompanyAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const id = idSchema.safeParse(formData.get('id'));
  const parsed = companySchema.safeParse(formFields(formData, COMPANY_FIELDS));
  if (!id.success) return fail('Esa empresa ya no existe.');
  if (!parsed.success) return fail('Revisa los datos.', toFieldErrors(parsed.error.issues));
  if (!(await updateCompany(id.data, parsed.data))) return fail('Esa empresa ya no existe.');
  await audit(begun, 'company.update', `company:${id.data}`, parsed.data.name);
  revalidate(id.data);
  return ok('Guardado. Los pedidos ya creados no cambian.');
}

/** The company and its list, gone. Orders already made stay, and lose their people on schedule. */
export async function deleteCompanyAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return fail('Esa empresa ya no existe.');
  if (String(formData.get('confirm') ?? '').trim().toUpperCase() !== 'BORRAR') {
    return fail('Escribe BORRAR para confirmarlo.', { confirm: 'Escribe BORRAR' });
  }
  const company = await findCompany(id.data);
  if (!company || !(await deleteCompany(company.id))) return fail('Esa empresa ya no existe.');
  await audit(begun, 'company.delete', `company:${company.id}`, `${company.name} y su lista de cumpleaños`);
  revalidate();
  redirect('/admin/cumpleanos');
}

/** A team list pasted from a spreadsheet: all of it goes in, or none of it. */
export async function importBirthdaysAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const parsed = birthdayImportSchema.safeParse(
    formFields(formData, [
      'companyId',
      'list',
      'address',
      'postalCode',
      'cakeId',
      'size',
      'timeSlot',
      'addressKind',
      'cakeText',
      'cardMessage',
      'signOff',
      'deliveryNotes',
    ]),
  );
  if (!parsed.success) return fail('Revisa la lista.', toFieldErrors(parsed.error.issues));
  const d = parsed.data;
  const [company, cake] = await Promise.all([findCompany(d.companyId), findCake(d.cakeId)]);
  if (!company) return fail('Esa empresa ya no existe.');
  if (!cake?.active) return fail('Elige una tarta de la carta.', { cakeId: 'No está en la carta' });
  if (cake.prices[d.size] === null) return fail('Esa tarta no se hace en ese tamaño.', { size: 'No disponible' });

  const count = await insertBirthdays(
    d.people.map((p) => ({
      companyId: company.id,
      active: true,
      recipientName: p.name,
      recipientCompany: p.company,
      day: p.day,
      month: p.month,
      addressKind: d.addressKind,
      address: p.address,
      postalCode: p.postalCode,
      deliveryNotes: d.deliveryNotes,
      cakeId: cake.id,
      size: d.size,
      cakeText: d.cakeText,
      cardMessage: d.cardMessage,
      signOff: d.signOff,
      timeSlot: d.timeSlot,
    })),
  );
  await audit(begun, 'birthday.import', `company:${company.id}`, plural(count, 'persona añadida', 'personas añadidas'));
  revalidate(company.id);
  return ok(`${plural(count, 'persona añadida', 'personas añadidas')}. Cada tarta se pide sola una semana antes.`);
}

export async function updateBirthdayAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const parsed = birthdaySchema.safeParse(
    formFields(formData, [
      'id',
      'recipientName',
      'recipientCompany',
      'birthday',
      'address',
      'postalCode',
      'cakeId',
      'size',
      'timeSlot',
      'addressKind',
      'cakeText',
      'cardMessage',
      'signOff',
      'deliveryNotes',
    ]),
  );
  if (!parsed.success) return fail('Revisa los datos.', toFieldErrors(parsed.error.issues));
  const d = parsed.data;
  const [person, cake] = await Promise.all([findBirthday(d.id), findCake(d.cakeId)]);
  if (!person) return fail('Esa persona ya no está en la lista.');
  if (!cake?.active) return fail('Elige una tarta de la carta.', { cakeId: 'No está en la carta' });
  if (cake.prices[d.size] === null) return fail('Esa tarta no se hace en ese tamaño.', { size: 'No disponible' });

  await updateBirthday(person.id, {
    recipientName: d.recipientName,
    recipientCompany: d.recipientCompany,
    day: d.birthday.day,
    month: d.birthday.month,
    addressKind: d.addressKind,
    address: d.address,
    postalCode: d.postalCode,
    deliveryNotes: d.deliveryNotes,
    cakeId: cake.id,
    size: d.size,
    cakeText: d.cakeText,
    cardMessage: d.cardMessage,
    signOff: d.signOff,
    timeSlot: d.timeSlot,
  });
  await audit(begun, 'birthday.update', `company:${person.companyId}`, `Persona ${person.id} cambiada`);
  revalidate(person.companyId);
  return ok('Guardado. Si su pedido de este año ya está creado, cámbialo en el pedido.');
}

export async function setBirthdayActiveAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const id = idSchema.safeParse(formData.get('id'));
  const person = id.success ? await findBirthday(id.data) : null;
  if (!person) return fail('Esa persona ya no está en la lista.');
  const active = formData.get('active') === 'true';
  await setBirthdayActive(person.id, active);
  await audit(begun, active ? 'birthday.resume' : 'birthday.pause', `company:${person.companyId}`, `Persona ${person.id}`);
  revalidate(person.companyId);
  return ok(active ? 'Reactivado: su tarta se volverá a pedir sola.' : 'En pausa: no se pedirá su tarta hasta que lo reactives.');
}

/** Someone who left the company: off the list for good. Their past orders stay, erased on schedule. */
export async function deleteBirthdayAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const id = idSchema.safeParse(formData.get('id'));
  const person = id.success ? await findBirthday(id.data) : null;
  if (!person || !(await deleteBirthday(person.id))) return fail('Esa persona ya no está en la lista.');
  await audit(begun, 'birthday.delete', `company:${person.companyId}`, `Persona ${person.id} quitada de la lista`);
  revalidate(person.companyId);
  return ok('Quitada de la lista.');
}

/** The next birthday's order, now, without waiting for the week before. */
export async function createBirthdayOrderNowAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const id = idSchema.safeParse(formData.get('id'));
  const person = id.success ? await findBirthday(id.data) : null;
  if (!person) return fail('Esa persona ya no está en la lista.');

  const result = await createBirthdayOrderNow(person, { id: begun.session.user.id, email: begun.session.user.email });
  if (!result.ok) {
    if (result.reason === 'exists') return fail(`Ya hay un pedido para su cumpleaños de ${result.plan.year}.`);
    return fail(`No se ha creado: ${result.problem}`);
  }
  revalidate(person.companyId);
  revalidatePath('/admin');
  return ok(`Pedido nº ${result.order.id} creado para el ${longDate(result.plan.deliverOn)}. Está en Pedidos, como «Nuevo».`);
}
