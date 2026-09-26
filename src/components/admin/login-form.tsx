'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { submitKeepingValues } from '@/components/admin/form';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { LIMITS } from '@/lib/constants';
import { loginAction } from '@/server/actions/auth-actions';
import { IDLE } from '@/server/actions/types';

function SignInButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="mt-1 w-full">
      {pending ? 'Comprobando…' : 'Entrar'}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, IDLE);
  const failed = state.status === 'error';

  return (
    <Card>
      <CardBody>
        {state.needsCode ? (
          <form action={formAction} onSubmit={submitKeepingValues(formAction)} className="flex flex-col gap-4">
            <p className="type-body text-ink-muted">{failed ? 'Escribe el código de 6 cifras de tu aplicación.' : state.message}</p>
            <Field label="Código de 6 cifras" htmlFor="code">
              <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus />
            </Field>
            {failed && state.message ? (
              <p role="alert" className="type-caption rounded-field bg-critical-soft px-3.5 py-2.5 font-medium text-critical">
                {state.message}
              </p>
            ) : null}
            <SignInButton />
            <a href="/admin/login" className="type-caption text-center underline underline-offset-2">
              Volver a empezar
            </a>
          </form>
        ) : (
          <form action={formAction} onSubmit={submitKeepingValues(formAction)} className="flex flex-col gap-4">
            <Field label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" autoComplete="username" required maxLength={200} autoFocus />
            </Field>
            <Field label="Contraseña" htmlFor="password">
              <Input id="password" name="password" type="password" autoComplete="current-password" required maxLength={LIMITS.passwordMaxLength} />
            </Field>
            {failed && state.message ? (
              <p role="alert" className="type-caption rounded-field bg-critical-soft px-3.5 py-2.5 font-medium text-critical">
                {state.message}
              </p>
            ) : null}
            <SignInButton />
          </form>
        )}
      </CardBody>
    </Card>
  );
}
