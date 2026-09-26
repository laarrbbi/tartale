'use client';

import { AdminForm, FormBanner, SubmitButton } from '@/components/admin/form';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { LIMITS } from '@/lib/constants';
import { changePasswordAction } from '@/server/actions/auth-actions';
import {
  cancelTwoFactorAction,
  confirmTwoFactorAction,
  disableTwoFactorAction,
  startTwoFactorAction,
} from '@/server/actions/two-factor-actions';

export function ChangePasswordForm({ csrfToken, forced }: { csrfToken: string; forced: boolean }) {
  return (
    <Card>
      <CardHeader
        title={forced ? 'Elige tu contraseña' : 'Cambiar la contraseña'}
        description={
          forced
            ? 'Has entrado con una contraseña temporal. Elige la tuya para seguir.'
            : `Al menos ${LIMITS.passwordMinLength} caracteres. Una frase larga es más segura que una palabra rara.`
        }
      />
      <CardBody className="pt-2">
        <AdminForm action={changePasswordAction} csrfToken={csrfToken} resetOnSuccess>
          {(state) => (
            <>
              <Field label="Contraseña actual" htmlFor="currentPassword" error={state.fieldErrors?.currentPassword}>
                <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
              </Field>
              <Field label="Contraseña nueva" htmlFor="newPassword" error={state.fieldErrors?.newPassword}>
                <Input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={LIMITS.passwordMinLength}
                  maxLength={LIMITS.passwordMaxLength}
                  required
                />
              </Field>
              <Field label="Repite la nueva" htmlFor="confirmPassword" error={state.fieldErrors?.confirmPassword}>
                <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
              </Field>
              <SubmitButton pendingLabel="Guardando…">Cambiar la contraseña</SubmitButton>
              <FormBanner state={state} />
            </>
          )}
        </AdminForm>
      </CardBody>
    </Card>
  );
}

export type TwoFactorView = { kind: 'off' } | { kind: 'pending'; qrDataUri: string; secret: string } | { kind: 'on' };

function CodeField({ error }: { error?: string }) {
  return (
    <Field label="Código de 6 cifras" htmlFor="code" error={error}>
      <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required />
    </Field>
  );
}

/** Two-step verification: the password, then a 6-digit code from the phone. */
export function TwoFactorCard({ view, csrfToken }: { view: TwoFactorView; csrfToken: string }) {
  return (
    <Card>
      <CardHeader
        title="Verificación en dos pasos"
        description={
          view.kind === 'on'
            ? 'Activada: para entrar hace falta tu contraseña y el código de la aplicación del móvil.'
            : 'Además de la contraseña, un código de 6 cifras que cambia cada 30 segundos en tu móvil. Aunque alguien consiga tu contraseña, sin tu móvil no entra.'
        }
      />
      <CardBody className="pt-2">
        {view.kind === 'off' ? (
          <AdminForm action={startTwoFactorAction} csrfToken={csrfToken} className="items-start">
            {(state) => (
              <>
                <SubmitButton variant="secondary" pendingLabel="Preparando…">
                  Activar
                </SubmitButton>
                <FormBanner state={state.status === 'error' ? state : { status: 'idle' }} />
              </>
            )}
          </AdminForm>
        ) : null}

        {view.kind === 'pending' ? (
          <div className="flex flex-col gap-5">
            <ol className="type-body list-decimal pl-5 text-ink-muted">
              <li>Instala una aplicación de códigos (Google Authenticator, Microsoft Authenticator; en iPhone vale la app Contraseñas).</li>
              <li>Añade una cuenta y escanea este código.</li>
              <li>Escribe el número de 6 cifras que te muestra.</li>
            </ol>
            {/* eslint-disable-next-line @next/next/no-img-element -- a data: URI generated on the server */}
            <img src={view.qrDataUri} alt="Código QR para la aplicación" width={200} height={200} className="rounded-field bg-white p-2 ring-1 ring-line" />
            <p className="type-caption">
              ¿No puedes escanearlo? Escribe esta clave: <code className="break-all font-mono text-ink">{view.secret}</code>
            </p>
            <AdminForm action={confirmTwoFactorAction} csrfToken={csrfToken}>
              {(state) => (
                <>
                  <CodeField error={state.fieldErrors?.code} />
                  <SubmitButton pendingLabel="Comprobando…">Confirmar y activar</SubmitButton>
                  <FormBanner state={state} />
                </>
              )}
            </AdminForm>
            <AdminForm action={cancelTwoFactorAction} csrfToken={csrfToken} className="items-start">
              {() => (
                <SubmitButton variant="ghost" size="sm" pendingLabel="…">
                  Cancelar
                </SubmitButton>
              )}
            </AdminForm>
          </div>
        ) : null}

        {view.kind === 'on' ? (
          <AdminForm action={disableTwoFactorAction} csrfToken={csrfToken}>
            {(state) => (
              <>
                <p className="type-caption">Para desactivarla, escribe un código actual de la aplicación.</p>
                <CodeField error={state.fieldErrors?.code} />
                <SubmitButton variant="danger" pendingLabel="…">
                  Desactivar
                </SubmitButton>
                <FormBanner state={state} />
              </>
            )}
          </AdminForm>
        ) : null}
      </CardBody>
    </Card>
  );
}
