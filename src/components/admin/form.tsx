'use client';

import { startTransition, useActionState, useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { CSRF_FIELD } from '@/lib/constants';
import { IDLE, type ActionState } from '@/server/actions/types';

/**
 * React resets a form once its action has run — even when the server
 * answered "check this field", so whatever was typed is gone. Cancelling the
 * native submit and dispatching inside a transition ourselves keeps the
 * values, and `useFormStatus` still reports pending. The `action` stays on the
 * <form> too, so a tap before hydration is still a POST, never a GET with the
 * fields in the URL.
 */
export function submitKeepingValues(dispatch: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  };
}

/**
 * Every panel form goes through here, so the CSRF token cannot be forgotten
 * on a new form — the kind of omission nobody sees in review.
 */
export function AdminForm({
  action,
  csrfToken,
  children,
  className,
  resetOnSuccess = false,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  csrfToken: string;
  children: (state: ActionState) => ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, IDLE);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state.status === 'success') formRef.current?.reset();
  }, [resetOnSuccess, state]);

  return (
    <form ref={formRef} action={formAction} onSubmit={submitKeepingValues(formAction)} className={cn('flex flex-col gap-4', className)}>
      <input type="hidden" name={CSRF_FIELD} value={csrfToken} />
      {children(state)}
    </form>
  );
}

/** The outcome of the last submit, announced without stealing focus. */
export function FormBanner({ state }: { state: ActionState }) {
  if (state.status === 'idle' || !state.message) return null;
  return (
    <p
      aria-live="polite"
      className={cn(
        'type-caption rounded-field px-3.5 py-2.5 font-medium',
        state.status === 'success' ? 'bg-positive-soft text-positive' : 'bg-critical-soft text-critical',
      )}
    >
      {state.message}
    </p>
  );
}

export function SubmitButton({
  children,
  pendingLabel = 'Guardando…',
  variant = 'primary',
  size = 'md',
  className,
  confirm,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Asks once before submitting: for the few actions that cannot be undone. */
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending}
      className={className}
      onClick={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
