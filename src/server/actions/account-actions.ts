'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { closeCustomerSession } from '@/server/auth/customer-session';
import { getDb } from '@/server/db/pg';
import { deleteCustomer, saveCustomerBilling, saveCustomerDetails } from '@/server/repositories/customers';
import { accountDetailsSchema } from '@/server/validation/schemas';

import { beginCustomerMutation, isActionState } from './begin';
import { formFields } from './form-data';
import { fail, ok, toFieldErrors, type ActionState } from './types';

/** Name, phone, company and, if wanted, the fiscal details: what the next order starts filled in with. */
export async function saveAccountDetailsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginCustomerMutation(formData);
  if (isActionState(begun)) return begun;
  const parsed = accountDetailsSchema.safeParse({
    ...formFields(formData, ['name', 'phone', 'company', 'billingName', 'billingTaxId', 'billingAddress', 'billingPostalCode', 'billingCity']),
    wantsInvoice: formData.get('wantsInvoice'),
  });
  if (!parsed.success) return fail('Revisa los datos marcados.', toFieldErrors(parsed.error.issues));
  const customerId = begun.session.customer.id;
  await getDb().transaction(async (tx) => {
    await saveCustomerDetails(customerId, parsed.data, tx);
    await saveCustomerBilling(customerId, parsed.data.billing, tx);
  });
  revalidatePath('/cuenta');
  return ok('Guardado. Tu próximo pedido empezará con estos datos.');
}

export async function signOutAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginCustomerMutation(formData);
  if (isActionState(begun)) return begun;
  await closeCustomerSession();
  redirect('/');
}

/**
 * Deletes the account there and then: its sign-ins, sessions and saved
 * details. Orders stay, unlinked, and follow the order rules like any other.
 */
export async function deleteAccountAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginCustomerMutation(formData);
  if (isActionState(begun)) return begun;
  if (formData.get('confirm') !== 'on') {
    return fail('Marca la casilla para confirmar.', { confirm: 'Confirma que quieres borrar la cuenta' });
  }
  await closeCustomerSession();
  await deleteCustomer(begun.session.customer.id);
  redirect('/entrar?borrada=1');
}
