'use client';

import { AdminForm, FormBanner, SubmitButton } from '@/components/admin/form';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { CARD_DESIGNS, CARD_DESIGN_IDS, type CardDesign } from '@/lib/cards';
import { ORDER_LIMITS, SIZES, SIZE_IDS, SLOTS, SLOT_IDS, formatEuros, type AddressKind, type CakeSize, type TimeSlot } from '@/lib/orders';
import {
  createBirthdayOrderNowAction,
  createCompanyAction,
  deleteBirthdayAction,
  deleteCompanyAction,
  importBirthdaysAction,
  setBirthdayActiveAction,
  updateBirthdayAction,
  updateCompanyAction,
} from '@/server/actions/birthday-actions';

export interface CakeOption {
  id: number;
  name: string;
  prices: Record<CakeSize, number | null>;
}

export interface CompanyFormData {
  id: number;
  name: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  billingNotes: string | null;
}

export interface BirthdayFormData {
  id: number;
  recipientName: string;
  recipientCompany: string | null;
  birthday: string;
  addressKind: AddressKind;
  address: string;
  postalCode: string;
  deliveryNotes: string | null;
  cakeId: number;
  size: CakeSize;
  cardDesign: CardDesign;
  cardMessage: string | null;
  signOff: string | null;
  timeSlot: TimeSlot;
}

function CompanyFields({ prefix, company, errors }: { prefix: string; company?: CompanyFormData; errors?: Record<string, string> }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Empresa" htmlFor={`${prefix}-name`} error={errors?.name}>
          <Input id={`${prefix}-name`} name="name" defaultValue={company?.name ?? ''} required maxLength={ORDER_LIMITS.company} />
        </Field>
        <Field label="Persona de contacto" htmlFor={`${prefix}-contact`} error={errors?.contactName} hint="Con quien se confirma cada tarta.">
          <Input id={`${prefix}-contact`} name="contactName" defaultValue={company?.contactName ?? ''} required maxLength={ORDER_LIMITS.name} />
        </Field>
        <Field label="Teléfono" htmlFor={`${prefix}-phone`} error={errors?.contactPhone}>
          <Input id={`${prefix}-phone`} name="contactPhone" type="tel" defaultValue={company?.contactPhone ?? ''} required maxLength={ORDER_LIMITS.phone} />
        </Field>
        <Field label="Email" htmlFor={`${prefix}-email`} error={errors?.contactEmail}>
          <Input id={`${prefix}-email`} name="contactEmail" type="email" defaultValue={company?.contactEmail ?? ''} maxLength={ORDER_LIMITS.email} />
        </Field>
      </div>
      <Field
        label="Facturación"
        htmlFor={`${prefix}-billing`}
        error={errors?.billingNotes}
        hint="NIF, dirección fiscal, cómo y cuándo paga (transferencia…)."
      >
        <Textarea id={`${prefix}-billing`} name="billingNotes" rows={3} defaultValue={company?.billingNotes ?? ''} maxLength={500} />
      </Field>
    </>
  );
}

export function NewCompanyForm({ csrfToken }: { csrfToken: string }) {
  return (
    <AdminForm action={createCompanyAction} csrfToken={csrfToken}>
      {(state) => (
        <>
          <CompanyFields prefix="new-company" errors={state.fieldErrors} />
          <SubmitButton variant="secondary" pendingLabel="Añadiendo…" className="self-start">
            Añadir la empresa
          </SubmitButton>
          <FormBanner state={state} />
        </>
      )}
    </AdminForm>
  );
}

export function CompanyForm({ company, csrfToken }: { company: CompanyFormData; csrfToken: string }) {
  return (
    <AdminForm action={updateCompanyAction} csrfToken={csrfToken}>
      {(state) => (
        <>
          <input type="hidden" name="id" value={company.id} />
          <CompanyFields prefix="company" company={company} errors={state.fieldErrors} />
          <SubmitButton variant="secondary" pendingLabel="Guardando…" className="self-start">
            Guardar
          </SubmitButton>
          <FormBanner state={state} />
        </>
      )}
    </AdminForm>
  );
}

export function DeleteCompanyForm({ id, csrfToken }: { id: number; csrfToken: string }) {
  return (
    <AdminForm action={deleteCompanyAction} csrfToken={csrfToken}>
      {(state) => (
        <>
          <input type="hidden" name="id" value={id} />
          <Field label="Escribe BORRAR" htmlFor="delete-company-confirm" error={state.fieldErrors?.confirm}>
            <Input id="delete-company-confirm" name="confirm" autoComplete="off" />
          </Field>
          <SubmitButton variant="danger" pendingLabel="Borrando…" className="self-start">
            Borrar la empresa y su lista
          </SubmitButton>
          <FormBanner state={state} />
        </>
      )}
    </AdminForm>
  );
}

/** The cake, the size, the slot and the words: shared by the import and the edit forms. */
function CakeAndWords({
  prefix,
  cakes,
  errors,
  values,
}: {
  prefix: string;
  cakes: CakeOption[];
  errors?: Record<string, string>;
  values: Partial<BirthdayFormData>;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Tarta" htmlFor={`${prefix}-cake`} error={errors?.cakeId}>
          <Select id={`${prefix}-cake`} name="cakeId" defaultValue={values.cakeId ? String(values.cakeId) : ''} required>
            <option value="" disabled>
              Elige…
            </option>
            {cakes.map((cake) => (
              <option key={cake.id} value={cake.id}>
                {cake.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tamaño" htmlFor={`${prefix}-size`} error={errors?.size}>
          <Select id={`${prefix}-size`} name="size" defaultValue={values.size ?? 'mediana'}>
            {SIZE_IDS.map((size) => (
              <option key={size} value={size}>
                {SIZES[size].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Franja" htmlFor={`${prefix}-slot`} error={errors?.timeSlot}>
          <Select id={`${prefix}-slot`} name="timeSlot" defaultValue={values.timeSlot ?? 'manana'}>
            {SLOT_IDS.map((slot) => (
              <option key={slot} value={slot}>
                {SLOTS[slot].label} ({SLOTS[slot].hours})
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <p className="type-caption -mt-1">
        {cakes.length
          ? cakes
              .slice(0, 4)
              .map((c) => `${c.name}: ${SIZE_IDS.map((s) => (c.prices[s] === null ? '—' : formatEuros(c.prices[s]!))).join(' / ')}`)
              .join(' · ')
          : 'No hay tartas en la carta.'}
        {cakes.length > 4 ? ' · …' : ''}
      </p>
      <Field label="Diseño de la tarjeta" htmlFor={`${prefix}-design`} error={errors?.cardDesign} hint="Nada va escrito en la tarta: el mensaje va en la tarjeta.">
        <Select id={`${prefix}-design`} name="cardDesign" defaultValue={values.cardDesign ?? 'clasica'}>
          {CARD_DESIGN_IDS.map((design) => (
            <option key={design} value={design}>
              {CARD_DESIGNS[design].label} · {CARD_DESIGNS[design].hint.toLowerCase()}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Tarjeta" htmlFor={`${prefix}-card`} error={errors?.cardMessage} hint="{nombre} se cambia por el nombre de pila de cada persona.">
        <Textarea id={`${prefix}-card`} name="cardMessage" rows={3} defaultValue={values.cardMessage ?? ''} maxLength={ORDER_LIMITS.cardMessage} />
      </Field>
      <Field label="Firma de la tarjeta" htmlFor={`${prefix}-sign`} error={errors?.signOff}>
        <Input id={`${prefix}-sign`} name="signOff" defaultValue={values.signOff ?? ''} maxLength={ORDER_LIMITS.signOff} />
      </Field>
    </>
  );
}

function AddressKindField({ prefix, value, error }: { prefix: string; value: AddressKind; error?: string }) {
  return (
    <Field
      label="Dónde se entrega"
      htmlFor={`${prefix}-kind`}
      error={error}
      hint="En la oficina, un cumpleaños en sábado o domingo se celebra el viernes antes."
    >
      <Select id={`${prefix}-kind`} name="addressKind" defaultValue={value}>
        <option value="oficina">En la oficina</option>
        <option value="casa">En casa</option>
      </Select>
    </Field>
  );
}

export function ImportBirthdaysForm({
  companyId,
  companyName,
  cakes,
  csrfToken,
}: {
  companyId: number;
  companyName: string;
  cakes: CakeOption[];
  csrfToken: string;
}) {
  return (
    <AdminForm action={importBirthdaysAction} csrfToken={csrfToken} resetOnSuccess>
      {(state) => (
        <>
          <input type="hidden" name="companyId" value={companyId} />
          <Field
            label="La lista"
            htmlFor="import-list"
            error={state.fieldErrors?.list}
            hint="Una persona por línea: Nombre; dd/mm; Empresa; Dirección; CP. Se puede pegar tal cual desde Excel."
          >
            <Textarea
              id="import-list"
              name="list"
              rows={6}
              placeholder={'Lucía Pérez; 14/03; ; ; \nMarcos Gil; 02/11; ; Calle Mayor 3, 2º; 03002'}
              className="font-mono text-[0.875rem]"
              required
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
            <Field label="Dirección para todos" htmlFor="import-address" error={state.fieldErrors?.address} hint="Para las líneas que no la traen.">
              <Input id="import-address" name="address" maxLength={ORDER_LIMITS.address} />
            </Field>
            <Field label="CP" htmlFor="import-postcode" error={state.fieldErrors?.postalCode}>
              <Input id="import-postcode" name="postalCode" inputMode="numeric" maxLength={5} />
            </Field>
          </div>
          <AddressKindField prefix="import" value="oficina" error={state.fieldErrors?.addressKind} />
          <Field label="Notas de entrega" htmlFor="import-notes" error={state.fieldErrors?.deliveryNotes} hint="Recepción, planta, horario…">
            <Input id="import-notes" name="deliveryNotes" maxLength={ORDER_LIMITS.notes} />
          </Field>
          <CakeAndWords
            prefix="import"
            cakes={cakes}
            errors={state.fieldErrors}
            values={{ cardDesign: 'clasica', cardMessage: '¡Feliz cumpleaños, {nombre}!', signOff: companyName }}
          />
          <SubmitButton pendingLabel="Añadiendo…" className="self-start">
            Añadir a la lista
          </SubmitButton>
          <FormBanner state={state} />
        </>
      )}
    </AdminForm>
  );
}

export function BirthdayEditForm({ person, cakes, csrfToken }: { person: BirthdayFormData; cakes: CakeOption[]; csrfToken: string }) {
  const prefix = `bday-${person.id}`;
  return (
    <AdminForm action={updateBirthdayAction} csrfToken={csrfToken}>
      {(state) => (
        <>
          <input type="hidden" name="id" value={person.id} />
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <Field label="Nombre" htmlFor={`${prefix}-name`} error={state.fieldErrors?.recipientName}>
              <Input id={`${prefix}-name`} name="recipientName" defaultValue={person.recipientName} required maxLength={ORDER_LIMITS.name} />
            </Field>
            <Field label="Cumpleaños" htmlFor={`${prefix}-date`} error={state.fieldErrors?.birthday}>
              <Input id={`${prefix}-date`} name="birthday" defaultValue={person.birthday} placeholder="dd/mm" required maxLength={10} />
            </Field>
          </div>
          <Field label="Empresa (si no es la que paga)" htmlFor={`${prefix}-company`} error={state.fieldErrors?.recipientCompany}>
            <Input id={`${prefix}-company`} name="recipientCompany" defaultValue={person.recipientCompany ?? ''} maxLength={ORDER_LIMITS.company} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <Field label="Dirección" htmlFor={`${prefix}-address`} error={state.fieldErrors?.address}>
              <Input id={`${prefix}-address`} name="address" defaultValue={person.address} required maxLength={ORDER_LIMITS.address} />
            </Field>
            <Field label="CP" htmlFor={`${prefix}-cp`} error={state.fieldErrors?.postalCode}>
              <Input id={`${prefix}-cp`} name="postalCode" defaultValue={person.postalCode} inputMode="numeric" required maxLength={5} />
            </Field>
          </div>
          <AddressKindField prefix={prefix} value={person.addressKind} error={state.fieldErrors?.addressKind} />
          <Field label="Notas de entrega" htmlFor={`${prefix}-notes`} error={state.fieldErrors?.deliveryNotes}>
            <Input id={`${prefix}-notes`} name="deliveryNotes" defaultValue={person.deliveryNotes ?? ''} maxLength={ORDER_LIMITS.notes} />
          </Field>
          <CakeAndWords prefix={prefix} cakes={cakes} errors={state.fieldErrors} values={person} />
          <SubmitButton variant="secondary" pendingLabel="Guardando…" className="self-start">
            Guardar
          </SubmitButton>
          <FormBanner state={state} />
        </>
      )}
    </AdminForm>
  );
}

export function BirthdayControls({ id, active, csrfToken }: { id: number; active: boolean; csrfToken: string }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      {active ? (
        <AdminForm action={createBirthdayOrderNowAction} csrfToken={csrfToken} className="items-start">
          {(state) => (
            <>
              <input type="hidden" name="id" value={id} />
              <SubmitButton variant="secondary" size="sm" pendingLabel="Creando…">
                Crear el pedido ya
              </SubmitButton>
              <FormBanner state={state} />
            </>
          )}
        </AdminForm>
      ) : null}
      <AdminForm action={setBirthdayActiveAction} csrfToken={csrfToken} className="items-start">
        {(state) => (
          <>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="active" value={active ? 'false' : 'true'} />
            <SubmitButton variant="ghost" size="sm" pendingLabel="…">
              {active ? 'Pausar' : 'Reactivar'}
            </SubmitButton>
            <FormBanner state={state} />
          </>
        )}
      </AdminForm>
    </div>
  );
}

/** Someone who left the company: off the list. Kept apart from the everyday buttons. */
export function DeleteBirthdayForm({ id, name, csrfToken }: { id: number; name: string; csrfToken: string }) {
  return (
    <AdminForm action={deleteBirthdayAction} csrfToken={csrfToken} className="items-start">
      {(state) => (
        <>
          <input type="hidden" name="id" value={id} />
          <SubmitButton variant="danger" size="sm" pendingLabel="…" confirm={`¿Quitar a ${name} de la lista? Sus pedidos ya hechos se quedan.`}>
            Quitar de la lista
          </SubmitButton>
          <FormBanner state={state} />
        </>
      )}
    </AdminForm>
  );
}
