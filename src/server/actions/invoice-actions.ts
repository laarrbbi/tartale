'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { plural } from '@/lib/format';
import { recordAudit } from '@/server/repositories/audit';
import { saveCompanyTax } from '@/server/repositories/birthdays';
import {
  auditIssued,
  correctInvoiceCustomer,
  issueCompanyInvoice,
  issueOrderInvoice,
  issuePendingInvoices,
  type InvoiceFailure,
} from '@/server/services/invoice-service';
import { companyTaxSchema } from '@/server/validation/panel';
import { billingSchema, idSchema } from '@/server/validation/schemas';

import { beginMutation, isActionState } from './begin';
import { formFields } from './form-data';
import { fail, ok, toFieldErrors, type ActionState } from './types';

const FAILURES: Record<InvoiceFailure, string> = {
  not_ready: 'Faltan los datos de la empresa o el tipo de IVA (Ajustes).',
  not_found: 'Ese pedido o esa factura ya no existe.',
  invoiced: 'Este pedido ya tiene factura.',
  nothing_to_invoice: 'No hay nada que facturar: no hay nada cobrado o está todo devuelto.',
  company_data: 'A la empresa le faltan sus datos fiscales (razón social, NIF y dirección).',
  not_eligible: 'Esa factura ya no es la vigente, o algún pedido ya está facturado o cancelado. Recarga la página.',
  not_paid: 'El pedido no está pagado.',
  already_complete: 'Ya es una factura completa.',
};

function revalidateInvoices() {
  revalidatePath('/admin/facturas', 'layout');
  revalidatePath('/admin/pedidos', 'layout');
  revalidatePath('/admin/cumpleanos', 'layout');
}

/** Invoices for the paid web orders that have none (paid before invoicing was set up). */
export async function issuePendingInvoicesAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const run = await issuePendingInvoices(begun.session.user.id);
  for (const invoice of run.issued) await auditIssued(invoice, begun.session.user.id, begun.session.user.email, begun.ipHash);
  revalidateInvoices();
  if (run.issued.length === 0 && run.failed === 0) return fail('No se ha emitido ninguna: revisa los datos de la empresa en Ajustes.');
  return run.failed > 0
    ? fail(`Emitidas ${run.issued.length}; ${plural(run.failed, 'pedido ha fallado', 'pedidos han fallado')}. Prueba otra vez.`)
    : ok(`Emitidas ${plural(run.issued.length, 'factura', 'facturas')}.`);
}

/** One order's invoice, from its page (an order made in the panel, or one whose invoice failed). */
export async function issueOrderInvoiceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const id = idSchema.safeParse(formData.get('orderId'));
  if (!id.success) return fail(FAILURES.not_found);
  const result = await issueOrderInvoice(id.data, { actorId: begun.session.user.id });
  if (!result.ok) return fail(FAILURES[result.reason]);
  await auditIssued(result.invoice, begun.session.user.id, begun.session.user.email, begun.ipHash);
  revalidateInvoices();
  return ok(`Emitida la factura ${result.invoice.number}.`);
}

/**
 * The customer's details on an invoice, corrected (or an S turned into an F
 * for someone who asked by email): a rectificativa and a new invoice.
 */
export async function correctInvoiceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const id = idSchema.safeParse(formData.get('invoiceId'));
  if (!id.success) return fail(FAILURES.not_found);
  const parsed = billingSchema.safeParse(formFields(formData, ['name', 'taxId', 'address', 'postalCode', 'city']));
  if (!parsed.success) return fail('Revisa los datos.', toFieldErrors(parsed.error.issues));
  const result = await correctInvoiceCustomer(id.data, parsed.data, begun.session.user.id);
  if (!result.ok) return fail(FAILURES[result.reason]);
  await auditIssued(result.invoice, begun.session.user.id, begun.session.user.email, begun.ipHash);
  revalidateInvoices();
  redirect(`/admin/facturas/${result.invoice.id}`);
}

/** One F for the company orders ticked on the company's page. */
export async function issueCompanyInvoiceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const parsed = z
    .object({ companyId: idSchema, orderIds: z.array(idSchema).max(300) })
    .safeParse({ companyId: formData.get('companyId'), orderIds: formData.getAll('orderIds') });
  if (!parsed.success) return fail(FAILURES.not_found);
  if (parsed.data.orderIds.length === 0) return fail('Marca al menos un pedido.');
  const result = await issueCompanyInvoice(parsed.data.companyId, parsed.data.orderIds, begun.session.user.id);
  if (!result.ok) return fail(FAILURES[result.reason]);
  await auditIssued(result.invoice, begun.session.user.id, begun.session.user.email, begun.ipHash);
  revalidateInvoices();
  return ok(`Emitida la factura ${result.invoice.number} por ${plural(parsed.data.orderIds.length, 'pedido', 'pedidos')}.`);
}

/** A company's fiscal details: all five or none. Invoices already issued keep theirs. */
export async function saveCompanyTaxAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const begun = await beginMutation(formData, { requireRole: 'owner' });
  if (isActionState(begun)) return begun;
  const id = idSchema.safeParse(formData.get('companyId'));
  if (!id.success) return fail('Esa empresa ya no existe.');
  const parsed = companyTaxSchema.safeParse(formFields(formData, ['taxName', 'taxId', 'taxAddress', 'taxPostalCode', 'taxCity']));
  if (!parsed.success) return fail('Revisa los datos fiscales.', toFieldErrors(parsed.error.issues));
  await saveCompanyTax(id.data, parsed.data);
  await recordAudit({
    actorId: begun.session.user.id,
    actorEmail: begun.session.user.email,
    action: 'company.update',
    target: `company:${id.data}`,
    detail: parsed.data ? 'Datos fiscales' : 'Datos fiscales borrados',
    ipHash: begun.ipHash,
  });
  revalidatePath(`/admin/cumpleanos/${id.data}`);
  return ok(parsed.data ? 'Datos fiscales guardados. Las facturas nuevas los llevan.' : 'Datos fiscales borrados.');
}
