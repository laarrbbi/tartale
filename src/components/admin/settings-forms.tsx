'use client';

import { AdminForm, FormBanner, SubmitButton } from '@/components/admin/form';
import { Field, Input, Textarea, Toggle } from '@/components/ui/field';
import { WEEKDAYS } from '@/lib/dates';
import { eurosInput } from '@/lib/orders';
import { formatVatRate } from '@/lib/invoices';
import { applySchemaUpdatesAction, saveBusinessAction, saveDeliveryPricesAction, saveSettingsAction } from '@/server/actions/settings-actions';

export interface SettingsFormData {
  ordersEnabled: boolean;
  minNoticeDays: number;
  maxDaysAhead: number;
  closedWeekdays: number[];
  whatsappNumber: string | null;
}

export function SettingsForm({ settings, csrfToken }: { settings: SettingsFormData; csrfToken: string }) {
  return (
    <AdminForm action={saveSettingsAction} csrfToken={csrfToken}>
      {(state) => (
        <>
          <div className="rounded-field bg-surface-sunken/50 px-4">
            <Toggle
              id="settings-open"
              name="ordersEnabled"
              label="Aceptar pedidos"
              description="Apagado, la web avisa de que ahora no se aceptan pedidos y no cobra nada."
              defaultChecked={settings.ordersEnabled}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Antelación mínima (días)"
              htmlFor="minNoticeDays"
              error={state.fieldErrors?.minNoticeDays}
              hint="1: se puede pedir para mañana. 2: para pasado mañana."
            >
              <Input id="minNoticeDays" name="minNoticeDays" inputMode="numeric" defaultValue={String(settings.minNoticeDays)} required />
            </Field>
            <Field label="Hasta cuántos días vista" htmlFor="maxDaysAhead" error={state.fieldErrors?.maxDaysAhead}>
              <Input id="maxDaysAhead" name="maxDaysAhead" inputMode="numeric" defaultValue={String(settings.maxDaysAhead)} required />
            </Field>
          </div>
          <fieldset>
            <legend className="type-body font-medium">Días sin reparto</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {WEEKDAYS.map((day) => (
                <label key={day.id} className="flex cursor-pointer items-center gap-2 rounded-pill bg-surface px-3.5 py-2 ring-1 ring-line-strong has-[:checked]:bg-chocolate has-[:checked]:text-ink-inverse has-[:checked]:ring-chocolate">
                  <input
                    type="checkbox"
                    name="closedWeekdays"
                    value={day.id}
                    defaultChecked={settings.closedWeekdays.includes(day.id)}
                    className="h-4 w-4 accent-[var(--brand)]"
                  />
                  <span className="type-caption font-medium text-inherit first-letter:uppercase">{day.label}</span>
                </label>
              ))}
            </div>
            {state.fieldErrors?.closedWeekdays ? (
              <p role="alert" className="type-caption mt-1.5 text-critical">
                {state.fieldErrors.closedWeekdays}
              </p>
            ) : (
              <p className="type-caption mt-1.5">Esos días el calendario no deja elegirlos.</p>
            )}
          </fieldset>
          <Field
            label="WhatsApp de Tartame"
            htmlFor="whatsappNumber"
            error={state.fieldErrors?.whatsappNumber}
            hint="Sale en la página de seguimiento («¿Algún cambio?») y en la web para equipos. Vacío: no se muestra."
          >
            <Input id="whatsappNumber" name="whatsappNumber" type="tel" defaultValue={settings.whatsappNumber ?? ''} maxLength={24} />
          </Field>
          <SubmitButton pendingLabel="Guardando…" className="self-start">
            Guardar
          </SubmitButton>
          <FormBanner state={state} />
        </>
      )}
    </AdminForm>
  );
}

export interface DeliveryZoneRow {
  id: number;
  label: string;
  deliveryCents: number;
}

export function DeliveryPricesForm({ zones, csrfToken }: { zones: DeliveryZoneRow[]; csrfToken: string }) {
  return (
    <AdminForm action={saveDeliveryPricesAction} csrfToken={csrfToken}>
      {(state) => (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {zones.map((zone) => (
              <Field key={zone.id} label={`${zone.label} (€)`} htmlFor={`zone-${zone.id}`} error={state.fieldErrors?.[`zone-${zone.id}`]}>
                <Input id={`zone-${zone.id}`} name={`zone-${zone.id}`} inputMode="decimal" defaultValue={eurosInput(zone.deliveryCents)} required />
              </Field>
            ))}
          </div>
          <SubmitButton variant="secondary" pendingLabel="Guardando…" className="self-start">
            Guardar los precios de entrega
          </SubmitButton>
          <FormBanner state={state} />
        </>
      )}
    </AdminForm>
  );
}

export function SchemaUpdatesForm({ pending, csrfToken }: { pending: boolean; csrfToken: string }) {
  return (
    <AdminForm action={applySchemaUpdatesAction} csrfToken={csrfToken} className="items-start">
      {(state) => (
        <>
          <SubmitButton variant={pending ? 'primary' : 'ghost'} size="sm" pendingLabel="Actualizando…">
            {pending ? 'Actualizar la base de datos' : 'Comprobar otra vez'}
          </SubmitButton>
          <FormBanner state={state} />
        </>
      )}
    </AdminForm>
  );
}

export interface BusinessFormData {
  legalName: string | null;
  taxId: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  email: string | null;
  registry: string | null;
  vatRateBp: number | null;
  invoiceNote: string | null;
}

export function BusinessForm({ business, csrfToken }: { business: BusinessFormData; csrfToken: string }) {
  const vat = business.vatRateBp === null ? '' : formatVatRate(business.vatRateBp).replace(' %', '');
  return (
    <AdminForm action={saveBusinessAction} csrfToken={csrfToken}>
      {(state) => (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Razón social" htmlFor="legalName" error={state.fieldErrors?.legalName} hint="Tal cual en Hacienda: «Ejemplo, S.L.», o tu nombre completo si eres autónomo.">
              <Input id="legalName" name="legalName" defaultValue={business.legalName ?? ''} maxLength={120} autoComplete="organization" />
            </Field>
            <Field label="NIF" htmlFor="taxId" error={state.fieldErrors?.taxId}>
              <Input id="taxId" name="taxId" defaultValue={business.taxId ?? ''} maxLength={30} autoCapitalize="characters" />
            </Field>
            <Field label="Dirección fiscal" htmlFor="address" error={state.fieldErrors?.address}>
              <Input id="address" name="address" defaultValue={business.address ?? ''} maxLength={200} autoComplete="street-address" />
            </Field>
            <div className="grid grid-cols-[7rem_1fr] gap-3">
              <Field label="C. postal" htmlFor="postalCode" error={state.fieldErrors?.postalCode}>
                <Input id="postalCode" name="postalCode" defaultValue={business.postalCode ?? ''} inputMode="numeric" maxLength={5} autoComplete="postal-code" />
              </Field>
              <Field label="Población" htmlFor="city" error={state.fieldErrors?.city}>
                <Input id="city" name="city" defaultValue={business.city ?? ''} maxLength={80} autoComplete="address-level2" />
              </Field>
            </div>
            <Field label="Email de contacto" htmlFor="email" error={state.fieldErrors?.email} hint="Para privacidad, dudas y facturas. Sale en la web.">
              <Input id="email" name="email" type="email" defaultValue={business.email ?? ''} maxLength={200} />
            </Field>
            <Field label="Datos registrales · si es sociedad" htmlFor="registry" error={state.fieldErrors?.registry} hint="Registro Mercantil, tomo, folio, hoja.">
              <Input id="registry" name="registry" defaultValue={business.registry ?? ''} maxLength={200} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
            <Field
              label="IVA de las tartas (%)"
              htmlFor="vatRateBp"
              error={state.fieldErrors?.vatRateBp}
              hint="El que te diga tu gestoría. Los precios ya lo incluyen; la factura lo desglosa."
            >
              <Input id="vatRateBp" name="vatRateBp" defaultValue={vat} inputMode="decimal" maxLength={10} />
            </Field>
            <Field
              label="Nota al pie de las facturas por transferencia · opcional"
              htmlFor="invoiceNote"
              error={state.fieldErrors?.invoiceNote}
              hint="La cuenta y el plazo, por ejemplo. Las pagadas con tarjeta dicen «Pagada con tarjeta»."
            >
              <Textarea id="invoiceNote" name="invoiceNote" defaultValue={business.invoiceNote ?? ''} maxLength={400} rows={2} />
            </Field>
          </div>
          <SubmitButton pendingLabel="Guardando…" className="self-start">
            Guardar los datos
          </SubmitButton>
          <FormBanner state={state} />
        </>
      )}
    </AdminForm>
  );
}
