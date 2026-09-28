'use client';

import { AdminForm, FormBanner, SubmitButton } from '@/components/admin/form';
import { Field, Input } from '@/components/ui/field';
import { INVOICE_LIMITS } from '@/lib/invoices';
import { formatEuros } from '@/lib/orders';
import {
  correctInvoiceAction,
  issueCompanyInvoiceAction,
  issueOrderInvoiceAction,
  issuePendingInvoicesAction,
  saveCompanyTaxAction,
} from '@/server/actions/invoice-actions';

export function IssuePendingForm({ count, csrfToken }: { count: number; csrfToken: string }) {
  return (
    <AdminForm action={issuePendingInvoicesAction} csrfToken={csrfToken} className="items-start">
      {(state) => (
        <>
          <SubmitButton size="sm" pendingLabel="Emitiendo…" confirm={`Se emitirán ${count} facturas con fecha de hoy. ¿Seguimos?`}>
            Emitir sus facturas
          </SubmitButton>
          <FormBanner state={state} />
        </>
      )}
    </AdminForm>
  );
}

export function IssueOrderInvoiceForm({ orderId, csrfToken }: { orderId: number; csrfToken: string }) {
  return (
    <AdminForm action={issueOrderInvoiceAction} csrfToken={csrfToken} className="items-start">
      {(state) => (
        <>
          <input type="hidden" name="orderId" value={orderId} />
          <SubmitButton variant="secondary" size="sm" pendingLabel="Emitiendo…">
            Emitir la factura
          </SubmitButton>
          <FormBanner state={state} />
        </>
      )}
    </AdminForm>
  );
}

export interface CustomerFormData {
  name: string;
  taxId: string;
  address: string;
  postalCode: string;
  city: string;
}

/** Name, NIF, address, postcode and town: the same five everywhere. */
function CustomerFields({ prefix, values, errors, names }: {
  prefix: string;
  values: Partial<CustomerFormData>;
  errors?: Record<string, string>;
  names: Record<keyof CustomerFormData, string>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Razón social, o nombre completo" htmlFor={`${prefix}-name`} error={errors?.[names.name]}>
        <Input id={`${prefix}-name`} name={names.name} defaultValue={values.name ?? ''} maxLength={INVOICE_LIMITS.name} />
      </Field>
      <Field label="NIF" htmlFor={`${prefix}-taxId`} error={errors?.[names.taxId]}>
        <Input id={`${prefix}-taxId`} name={names.taxId} defaultValue={values.taxId ?? ''} maxLength={30} autoCapitalize="characters" />
      </Field>
      <Field label="Dirección fiscal" htmlFor={`${prefix}-address`} error={errors?.[names.address]}>
        <Input id={`${prefix}-address`} name={names.address} defaultValue={values.address ?? ''} maxLength={INVOICE_LIMITS.address} />
      </Field>
      <div className="grid grid-cols-[7rem_1fr] gap-3">
        <Field label="C. postal" htmlFor={`${prefix}-postalCode`} error={errors?.[names.postalCode]}>
          <Input id={`${prefix}-postalCode`} name={names.postalCode} defaultValue={values.postalCode ?? ''} inputMode="numeric" maxLength={5} />
        </Field>
        <Field label="Población" htmlFor={`${prefix}-city`} error={errors?.[names.city]}>
          <Input id={`${prefix}-city`} name={names.city} defaultValue={values.city ?? ''} maxLength={INVOICE_LIMITS.city} />
        </Field>
      </div>
    </div>
  );
}

const PLAIN = { name: 'name', taxId: 'taxId', address: 'address', postalCode: 'postalCode', city: 'city' } as const;

export function CorrectInvoiceForm({
  invoiceId,
  simplified,
  values,
  csrfToken,
}: {
  invoiceId: number;
  simplified: boolean;
  values: Partial<CustomerFormData>;
  csrfToken: string;
}) {
  return (
    <AdminForm action={correctInvoiceAction} csrfToken={csrfToken}>
      {(state) => (
        <>
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <CustomerFields prefix="correct" values={values} errors={state.fieldErrors} names={PLAIN} />
          <SubmitButton
            variant="secondary"
            pendingLabel="Emitiendo…"
            className="self-start"
            confirm={
              simplified
                ? 'Se emitirá una factura completa con estos datos. ¿Seguimos?'
                : 'Se emitirán una rectificativa que anula esta factura y una nueva con estos datos. ¿Seguimos?'
            }
          >
            {simplified ? 'Emitir la factura completa' : 'Rectificar y emitir la nueva'}
          </SubmitButton>
          <FormBanner state={state} />
        </>
      )}
    </AdminForm>
  );
}

export function CompanyTaxForm({ companyId, values, csrfToken }: { companyId: number; values: Partial<CustomerFormData>; csrfToken: string }) {
  return (
    <AdminForm action={saveCompanyTaxAction} csrfToken={csrfToken}>
      {(state) => (
        <>
          <input type="hidden" name="companyId" value={companyId} />
          <CustomerFields
            prefix="company-tax"
            values={values}
            errors={state.fieldErrors}
            names={{ name: 'taxName', taxId: 'taxId', address: 'taxAddress', postalCode: 'taxPostalCode', city: 'taxCity' }}
          />
          <SubmitButton variant="secondary" pendingLabel="Guardando…" className="self-start">
            Guardar los datos fiscales
          </SubmitButton>
          <FormBanner state={state} />
        </>
      )}
    </AdminForm>
  );
}

export interface InvoiceableOrder {
  id: number;
  label: string;
  cents: number;
  delivered: boolean;
}

export function CompanyInvoiceForm({ companyId, orders, csrfToken }: { companyId: number; orders: InvoiceableOrder[]; csrfToken: string }) {
  return (
    <AdminForm action={issueCompanyInvoiceAction} csrfToken={csrfToken}>
      {(state) => (
        <>
          <input type="hidden" name="companyId" value={companyId} />
          <ul className="flex flex-col divide-y divide-line">
            {orders.map((order) => (
              <li key={order.id}>
                <label className="flex cursor-pointer items-center gap-3 py-2.5">
                  <input type="checkbox" name="orderIds" value={order.id} defaultChecked={order.delivered} className="h-4 w-4 accent-[var(--brand)]" />
                  <span className="type-body min-w-0 flex-1">{order.label}</span>
                  <span className="type-body type-numeric">{formatEuros(order.cents)}</span>
                </label>
              </li>
            ))}
          </ul>
          <SubmitButton
            pendingLabel="Emitiendo…"
            className="self-start"
            size="sm"
            confirm="Se emitirá una factura con fecha de hoy por los pedidos marcados. ¿Seguimos?"
          >
            Emitir la factura de los marcados
          </SubmitButton>
          <FormBanner state={state} />
        </>
      )}
    </AdminForm>
  );
}
