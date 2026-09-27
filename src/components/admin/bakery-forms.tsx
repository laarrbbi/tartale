'use client';

import { AdminForm, FormBanner, SubmitButton } from '@/components/admin/form';
import { Field, Input, Select, Textarea, Toggle } from '@/components/ui/field';
import { CAKE_PHOTOS } from '@/lib/cake-photos';
import { SIZES, SIZE_IDS, eurosInput, type CakeSize } from '@/lib/orders';
import { formatPostcodes } from '@/lib/zones';
import { createBakeryAction, saveCakeAction, saveZoneAction, updateBakeryAction } from '@/server/actions/bakery-actions';

/** Plain data only crosses into these client forms. */
export interface BakeryFormData {
  id: number;
  name: string;
  city: string;
  address: string | null;
  contactName: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  active: boolean;
  sizeNotes: Partial<Record<CakeSize, string>>;
  notes: string | null;
}

export interface ZoneFormData {
  id: number;
  name: string;
  city: string;
  postalCodes: string[];
  deliveryCents: number;
  active: boolean;
}

export interface CakeFormData {
  id: number;
  name: string;
  description: string | null;
  photo: string | null;
  prices: Record<CakeSize, number | null>;
  active: boolean;
  sortOrder: number;
}

const NOTE_FIELD: Record<CakeSize, string> = { pequena: 'notePequena', mediana: 'noteMediana', grande: 'noteGrande' };
const PRICE_FIELD: Record<CakeSize, string> = { pequena: 'pricePequena', mediana: 'priceMediana', grande: 'priceGrande' };

export function NewBakeryForm({ csrfToken }: { csrfToken: string }) {
  return (
    <AdminForm action={createBakeryAction} csrfToken={csrfToken}>
      {(state) => (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" htmlFor="new-bakery-name" error={state.fieldErrors?.name}>
              <Input id="new-bakery-name" name="name" required maxLength={80} />
            </Field>
            <Field label="Ciudad" htmlFor="new-bakery-city" error={state.fieldErrors?.city}>
              <Input id="new-bakery-city" name="city" required maxLength={60} />
            </Field>
          </div>
          <SubmitButton variant="secondary" pendingLabel="Añadiendo…" className="self-start">
            Añadir la pastelería
          </SubmitButton>
          <FormBanner state={state} />
        </>
      )}
    </AdminForm>
  );
}

export function BakeryDetailsForm({ bakery, csrfToken }: { bakery: BakeryFormData; csrfToken: string }) {
  return (
    <AdminForm action={updateBakeryAction} csrfToken={csrfToken}>
      {(state) => (
        <>
          <input type="hidden" name="id" value={bakery.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" htmlFor="bakery-name" error={state.fieldErrors?.name}>
              <Input id="bakery-name" name="name" defaultValue={bakery.name} required maxLength={80} />
            </Field>
            <Field label="Ciudad" htmlFor="bakery-city" error={state.fieldErrors?.city}>
              <Input id="bakery-city" name="city" defaultValue={bakery.city} required maxLength={60} />
            </Field>
            <Field label="Dirección" htmlFor="bakery-address" error={state.fieldErrors?.address}>
              <Input id="bakery-address" name="address" defaultValue={bakery.address ?? ''} maxLength={200} />
            </Field>
            <Field label="Persona de contacto" htmlFor="bakery-contact" error={state.fieldErrors?.contactName}>
              <Input id="bakery-contact" name="contactName" defaultValue={bakery.contactName ?? ''} maxLength={80} />
            </Field>
            <Field label="Teléfono" htmlFor="bakery-phone" error={state.fieldErrors?.phone}>
              <Input id="bakery-phone" name="phone" type="tel" defaultValue={bakery.phone ?? ''} maxLength={24} />
            </Field>
            <Field label="WhatsApp" htmlFor="bakery-whatsapp" error={state.fieldErrors?.whatsapp} hint="Para pasarle los pedidos.">
              <Input id="bakery-whatsapp" name="whatsapp" type="tel" defaultValue={bakery.whatsapp ?? ''} maxLength={24} />
            </Field>
            <Field label="Email" htmlFor="bakery-email" error={state.fieldErrors?.email}>
              <Input id="bakery-email" name="email" type="email" defaultValue={bakery.email ?? ''} maxLength={200} />
            </Field>
          </div>

          <div className="divide-y divide-line rounded-field bg-surface-sunken/50 px-4">
            <Toggle
              id="bakery-active"
              name="active"
              label="Activa"
              description="Pausada, sus códigos postales dejan de aceptar pedidos de la web."
              defaultChecked={bakery.active}
            />
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="type-body mb-1 font-medium">Qué es cada tamaño en esta pastelería</legend>
            <p className="type-caption -mt-1">
              Lo que te diga la pastelería (medida, raciones…). Sale debajo del precio en el formulario. Vacío: no se muestra nada.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {SIZE_IDS.map((size) => (
                <Field key={size} label={SIZES[size].label} htmlFor={`bakery-note-${size}`} error={state.fieldErrors?.[NOTE_FIELD[size]]}>
                  <Input id={`bakery-note-${size}`} name={NOTE_FIELD[size]} defaultValue={bakery.sizeNotes[size] ?? ''} maxLength={60} />
                </Field>
              ))}
            </div>
          </fieldset>

          <Field label="Notas internas" htmlFor="bakery-notes" error={state.fieldErrors?.notes} hint="Horarios de recogida, cómo prefiere que le pasemos los pedidos…">
            <Textarea id="bakery-notes" name="notes" rows={3} defaultValue={bakery.notes ?? ''} maxLength={500} />
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

/** A zone: the postcodes a bakery delivers to, at one delivery price. Without `zone`, a new one. */
export function ZoneForm({ bakeryId, city, zone, csrfToken }: { bakeryId: number; city: string; zone?: ZoneFormData; csrfToken: string }) {
  const key = zone ? `zone-${zone.id}` : 'zone-new';
  return (
    <AdminForm action={saveZoneAction} csrfToken={csrfToken} resetOnSuccess={!zone}>
      {(state) => (
        <>
          <input type="hidden" name="bakeryId" value={bakeryId} />
          {zone ? <input type="hidden" name="id" value={zone.id} /> : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Nombre de la zona" htmlFor={`${key}-name`} error={state.fieldErrors?.name}>
              <Input id={`${key}-name`} name="name" defaultValue={zone?.name ?? ''} placeholder="Centro" required maxLength={60} />
            </Field>
            <Field label="Ciudad" htmlFor={`${key}-city`} error={state.fieldErrors?.city}>
              <Input id={`${key}-city`} name="city" defaultValue={zone?.city ?? city} required maxLength={60} />
            </Field>
            <Field label="Entrega (€)" htmlFor={`${key}-delivery`} error={state.fieldErrors?.deliveryEuros}>
              <Input
                id={`${key}-delivery`}
                name="deliveryEuros"
                inputMode="decimal"
                defaultValue={zone ? eurosInput(zone.deliveryCents) : ''}
                required
              />
            </Field>
          </div>
          <Field
            label="Códigos postales"
            htmlFor={`${key}-codes`}
            error={state.fieldErrors?.postalCodes}
            hint="Sueltos o en rangos: 03001–03016, 03540"
          >
            <Textarea id={`${key}-codes`} name="postalCodes" rows={2} defaultValue={zone ? formatPostcodes(zone.postalCodes) : ''} required />
          </Field>
          <Toggle id={`${key}-active`} name="active" label="Activa" defaultChecked={zone?.active ?? true} />
          <SubmitButton variant="secondary" pendingLabel="Guardando…" className="self-start">
            {zone ? 'Guardar la zona' : 'Añadir la zona'}
          </SubmitButton>
          <FormBanner state={state} />
        </>
      )}
    </AdminForm>
  );
}

/** A cake on the menu, with a price per size. Without `cake`, a new one. */
export function CakeForm({ bakeryId, cake, csrfToken }: { bakeryId: number; cake?: CakeFormData; csrfToken: string }) {
  const key = cake ? `cake-${cake.id}` : 'cake-new';
  return (
    <AdminForm action={saveCakeAction} csrfToken={csrfToken} resetOnSuccess={!cake}>
      {(state) => (
        <>
          <input type="hidden" name="bakeryId" value={bakeryId} />
          {cake ? <input type="hidden" name="id" value={cake.id} /> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" htmlFor={`${key}-name`} error={state.fieldErrors?.name}>
              <Input id={`${key}-name`} name="name" defaultValue={cake?.name ?? ''} required maxLength={60} />
            </Field>
            <Field label="Foto" htmlFor={`${key}-photo`} error={state.fieldErrors?.photo}>
              <Select id={`${key}-photo`} name="photo" defaultValue={cake?.photo ?? ''}>
                <option value="">Sin foto</option>
                {CAKE_PHOTOS.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Descripción" htmlFor={`${key}-description`} error={state.fieldErrors?.description} hint="Una línea: de qué es. Sin inventar nada que no diga la pastelería.">
            <Input id={`${key}-description`} name="description" defaultValue={cake?.description ?? ''} maxLength={200} />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="type-body mb-1 font-medium">Precio por tamaño (€)</legend>
            <div className="grid grid-cols-3 gap-3">
              {SIZE_IDS.map((size) => (
                <Field key={size} label={SIZES[size].label} htmlFor={`${key}-${size}`} error={state.fieldErrors?.[PRICE_FIELD[size]]}>
                  <Input id={`${key}-${size}`} name={PRICE_FIELD[size]} inputMode="decimal" defaultValue={eurosInput(cake?.prices[size] ?? null)} />
                </Field>
              ))}
            </div>
            <p className="type-caption">Vacío: ese tamaño no se ofrece.</p>
          </fieldset>
          <div className="grid items-end gap-3 sm:grid-cols-2">
            <Field label="Orden en la carta" htmlFor={`${key}-sort`} error={state.fieldErrors?.sortOrder} hint="Los números bajos salen antes.">
              <Input id={`${key}-sort`} name="sortOrder" inputMode="numeric" defaultValue={String(cake?.sortOrder ?? 100)} />
            </Field>
            <Toggle id={`${key}-active`} name="active" label="En la carta" defaultChecked={cake?.active ?? true} />
          </div>
          <SubmitButton variant="secondary" pendingLabel="Guardando…" className="self-start">
            {cake ? 'Guardar la tarta' : 'Añadir a la carta'}
          </SubmitButton>
          <FormBanner state={state} />
        </>
      )}
    </AdminForm>
  );
}
