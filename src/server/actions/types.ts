/** Shape every server action returns, consumed by `useActionState` in forms. */
export interface ActionState {
  status: 'idle' | 'success' | 'error';
  message?: string;
  /** Field-level messages, keyed by form field name. */
  fieldErrors?: Record<string, string>;
  /**
   * A value shown once to whoever asked for it (a temporary password). It
   * lives only in this response and the form's state: never logged or stored.
   */
  secret?: string;
  /** Login only: the password was right and the 6-digit code is next. */
  needsCode?: boolean;
}

export const IDLE: ActionState = { status: 'idle' };

export function ok(message: string): ActionState {
  return { status: 'success', message };
}

export function okWithSecret(message: string, secret: string): ActionState {
  return { status: 'success', message, secret };
}

export function fail(message: string, fieldErrors?: Record<string, string>): ActionState {
  return { status: 'error', message, fieldErrors };
}

/** Flattens a zod issue list into `{ fieldName: firstMessage }`. */
export function toFieldErrors(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '_');
    errors[key] ??= issue.message;
  }
  return errors;
}
