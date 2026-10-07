'use client';

import { useState } from 'react';

import { AdminForm, FormBanner, SubmitButton } from '@/components/admin/form';
import { Field, Input } from '@/components/ui/field';
import { INVOICE_LIMITS } from '@/lib/invoices';
import { ORDER_LIMITS } from '@/lib/orders';
import { deleteAccountAction, saveAccountDetailsAction, signOutAction } from '@/server/actions/account-actions';

/*
 * The account's forms go through AdminForm too: one form component carries
 * the CSRF token (CSRF_FIELD) for every form with a session behind it, the
 * team's and the customers' alike.
 */

export interface AccountDetailsValues {
  name: string;
  phone: string;
  company: string;
  billing: { name: string; taxId: string; address: string; postalCode: string; city: string } | null;
}

export function AccountDetailsForm({ values, csrfToken }: { values: AccountDetailsValues; csrfToken: string }) {
  const [wantsInvoice, setWantsInvoice] = useState(values.billing !== null);
  return (
    <AdminForm action={saveAccountDetailsAction} csrfToken={csrfToken}>
      {(state) => {
        const error = (name: string) => state.fieldErrors?.[name];
        return (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tu nombre" htmlFor="account-name" error={error('name')}>
                <Input id="account-name" name="name" defaultValue={values.name} required autoComplete="name" maxLength={ORDER_LIMITS.name} />
              </Field>
              <Field label="Tu teléfono" htmlFor="account-phone" error={error('phone')}>
                <Input id="account-phone" name="phone" defaultValue={values.phone} type="tel" inputMode="tel" autoComplete="tel" maxLength={ORDER_LIMITS.phone} />
              </Field>
              <Field label="Tu empresa · opcional" htmlFor="account-company" error={error('company')}>
                <Input id="account-company" name="company" defaultValue={values.company} autoComplete="organization" maxLength={ORDER_LIMITS.company} />
              </Field>
            </div>
            <label className="flex cursor-pointer items-start gap-3 px-1">
              <input
                type="checkbox"
                name="wantsInvoice"
                checked={wantsInvoice}
                onChange={(e) => setWantsInvoice(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]"
              />
              <span className="type-caption text-pretty text-ink">Guardar datos para facturas a nombre de una empresa o de un autónomo.</span>
            </label>
            {wantsInvoice ? (
              <fieldset className="step-enter flex flex-col gap-4 rounded-field bg-surface-sunken/60 p-4">
                <legend className="sr-only">Datos de facturación</legend>
                <Field label="Razón social, o nombre completo" htmlFor="account-billingName" error={error('billingName')}>
                  <Input id="account-billingName" name="billingName" defaultValue={values.billing?.name ?? ''} required minLength={2} autoComplete="organization" maxLength={INVOICE_LIMITS.name} />
                </Field>
                <Field label="NIF" htmlFor="account-billingTaxId" error={error('billingTaxId')} hint="De la empresa, o tu DNI o NIE si eres autónomo.">
                  <Input id="account-billingTaxId" name="billingTaxId" defaultValue={values.billing?.taxId ?? ''} required maxLength={30} autoCapitalize="characters" spellCheck={false} />
                </Field>
                <Field label="Dirección fiscal" htmlFor="account-billingAddress" error={error('billingAddress')}>
                  <Input id="account-billingAddress" name="billingAddress" defaultValue={values.billing?.address ?? ''} required minLength={5} autoComplete="street-address" maxLength={INVOICE_LIMITS.address} />
                </Field>
                <div className="grid grid-cols-[7rem_1fr] gap-3">
                  <Field label="C. postal" htmlFor="account-billingPostalCode" error={error('billingPostalCode')}>
                    <Input id="account-billingPostalCode" name="billingPostalCode" defaultValue={values.billing?.postalCode ?? ''} required inputMode="numeric" pattern="\d{5}" maxLength={5} autoComplete="postal-code" />
                  </Field>
                  <Field label="Población" htmlFor="account-billingCity" error={error('billingCity')}>
                    <Input id="account-billingCity" name="billingCity" defaultValue={values.billing?.city ?? ''} required minLength={2} autoComplete="address-level2" maxLength={INVOICE_LIMITS.city} />
                  </Field>
                </div>
              </fieldset>
            ) : null}
            <SubmitButton className="self-start">Guardar</SubmitButton>
            <FormBanner state={state} />
          </>
        );
      }}
    </AdminForm>
  );
}

export function SignOutForm({ csrfToken }: { csrfToken: string }) {
  return (
    <AdminForm action={signOutAction} csrfToken={csrfToken} className="items-start">
      {(state) => (
        <>
          <SubmitButton variant="secondary" size="sm" pendingLabel="Saliendo…">
            Cerrar sesión
          </SubmitButton>
          <FormBanner state={state} />
        </>
      )}
    </AdminForm>
  );
}

export function DeleteAccountForm({ csrfToken }: { csrfToken: string }) {
  return (
    <AdminForm action={deleteAccountAction} csrfToken={csrfToken} className="items-start">
      {(state) => (
        <>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" name="confirm" className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--critical)]" />
            <span className="type-caption text-pretty text-ink">
              Sí, borrad mi cuenta y mis datos guardados. No se puede deshacer.
            </span>
          </label>
          {state.fieldErrors?.confirm ? (
            <p role="alert" className="type-caption text-critical">
              {state.fieldErrors.confirm}
            </p>
          ) : null}
          <SubmitButton variant="danger" size="sm" pendingLabel="Borrando…">
            Borrar mi cuenta
          </SubmitButton>
          <FormBanner state={state} />
        </>
      )}
    </AdminForm>
  );
}
