/**
 * Customer accounts, the parts both the server and the browser need: which
 * ways to sign in exist, where someone may be sent back to, and what to say
 * when it does not work.
 */

/** The ways to sign in, in the order their buttons appear. */
export const PROVIDER_IDS = ['google', 'apple', 'microsoft'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  google: 'Google',
  apple: 'Apple',
  microsoft: 'Microsoft',
};

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value);
}

/**
 * Where someone goes after signing in: a fixed list, never a URL taken from
 * the query string, so a sign-in link can never be turned into a redirect to
 * another site.
 */
export const RETURN_PATHS = ['/cuenta', '/enviar'] as const;
export type ReturnPath = (typeof RETURN_PATHS)[number];

export function safeReturnPath(value: unknown): ReturnPath {
  return (RETURN_PATHS as readonly unknown[]).includes(value) ? (value as ReturnPath) : '/cuenta';
}

export const SIGN_IN_ERRORS = {
  cancelado: 'Has cancelado el inicio de sesión. Puedes volver a intentarlo cuando quieras.',
  caducado: 'El inicio de sesión ha caducado o se ha abierto en otra pestaña. Vuelve a intentarlo.',
  fallo: 'No hemos podido comprobar tu cuenta. Vuelve a intentarlo dentro de un momento.',
  limite: 'Demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo.',
  'no-disponible': 'Esa forma de entrar no está disponible.',
} as const;
export type SignInErrorCode = keyof typeof SIGN_IN_ERRORS;

export function signInErrorMessage(code: unknown): string | null {
  return typeof code === 'string' && Object.hasOwn(SIGN_IN_ERRORS, code) ? SIGN_IN_ERRORS[code as SignInErrorCode] : null;
}
