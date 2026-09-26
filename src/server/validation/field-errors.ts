import type { ZodError } from 'zod';

/**
 * A zod error as `{ field: firstMessage }` plus one form-level message.
 * Only the first message per field: three complaints about one input are a
 * wall of text, and the rest surface once the first is fixed.
 */
export function fieldErrors(error: ZodError): { fields: Record<string, string>; formMessage: string | null } {
  const fields: Record<string, string> = {};
  let formMessage: string | null = null;
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string') fields[key] ??= issue.message;
    else formMessage ??= issue.message;
  }
  return { fields, formMessage };
}
