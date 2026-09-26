'use client';

import { AdminForm, FormBanner, SubmitButton } from '@/components/admin/form';
import { Field, Input, Select } from '@/components/ui/field';
import { createAccountAction, resetAccountPasswordAction, setAccountActiveAction } from '@/server/actions/team-actions';
import type { ActionState } from '@/server/actions/types';

/**
 * A temporary password, shown once: read off this screen and typed on
 * another, so it sits on its own line in a monospace face, and one tap
 * selects all of it.
 */
function OneTimeSecret({ state }: { state: ActionState }) {
  if (state.status === 'success' && state.secret) {
    return (
      <div aria-live="polite" className="rounded-field bg-positive-soft px-3.5 py-3">
        <p className="type-caption font-medium text-positive text-pretty">{state.message}</p>
        <p className="mt-1.5 select-all whitespace-nowrap font-mono text-lg tracking-wide text-ink">{state.secret}</p>
      </div>
    );
  }
  return <FormBanner state={state} />;
}

export function NewAccountForm({ csrfToken }: { csrfToken: string }) {
  return (
    <AdminForm action={createAccountAction} csrfToken={csrfToken} resetOnSuccess>
      {(state) => (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Nombre" htmlFor="new-account-name" error={state.fieldErrors?.displayName}>
              <Input id="new-account-name" name="displayName" required maxLength={80} autoComplete="off" />
            </Field>
            <Field label="Email" htmlFor="new-account-email" error={state.fieldErrors?.email}>
              <Input id="new-account-email" name="email" type="email" required maxLength={200} autoComplete="off" />
            </Field>
            <Field label="Papel" htmlFor="new-account-role" error={state.fieldErrors?.role}>
              <Select id="new-account-role" name="role" defaultValue="staff">
                <option value="staff">Equipo: pedidos y pastelerías</option>
                <option value="owner">Propietario: todo, también dinero y ajustes</option>
              </Select>
            </Field>
          </div>
          <SubmitButton variant="secondary" pendingLabel="Creando…" className="self-start">
            Crear la cuenta
          </SubmitButton>
          <OneTimeSecret state={state} />
        </>
      )}
    </AdminForm>
  );
}

export function AccountControls({ id, email, active, csrfToken }: { id: number; email: string; active: boolean; csrfToken: string }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      {active ? (
        <AdminForm action={resetAccountPasswordAction} csrfToken={csrfToken} className="items-start">
          {(state) => (
            <>
              <input type="hidden" name="id" value={id} />
              <SubmitButton
                variant="secondary"
                size="sm"
                pendingLabel="Generando…"
                confirm={`¿Nueva contraseña temporal para ${email}? La actual deja de valer y se cierran sus sesiones.`}
              >
                Nueva contraseña
              </SubmitButton>
              <OneTimeSecret state={state} />
            </>
          )}
        </AdminForm>
      ) : null}
      <AdminForm action={setAccountActiveAction} csrfToken={csrfToken} className="items-start">
        {(state) => (
          <>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="active" value={active ? 'false' : 'true'} />
            <SubmitButton
              variant={active ? 'ghost' : 'secondary'}
              size="sm"
              pendingLabel="Guardando…"
              confirm={active ? `¿Desactivar la cuenta de ${email}? Sale del panel ahora mismo.` : undefined}
            >
              {active ? 'Desactivar' : 'Reactivar'}
            </SubmitButton>
            <FormBanner state={state} />
          </>
        )}
      </AdminForm>
    </div>
  );
}
