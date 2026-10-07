/** Hard limits shared by validation, the database and the UI. */
export const LIMITS = {
  /** NIST SP 800-63B: length over composition rules. */
  passwordMinLength: 12,
  passwordMaxLength: 128,
} as const;

/** Lifetimes, in seconds. */
export const TTL = {
  /** A session unused for this long is rejected. */
  sessionIdle: 60 * 60 * 8,
  /** A session is rejected this long after login, always. */
  sessionAbsolute: 60 * 60 * 24 * 7,
  /** How long a failed-login lockout lasts. */
  loginLockout: 60 * 15,
  /** Between a correct password and its 6-digit code. */
  twoFactorPending: 60 * 5,
  /** A customer's session, after signing in with Google, Apple or Microsoft. */
  customerSession: 60 * 60 * 24 * 30,
  /** From leaving for Google, Apple or Microsoft to coming back from them. */
  signIn: 60 * 10,
} as const;

/**
 * Cookie names. `__Host-` makes the browser refuse the cookie unless it is
 * Secure, Path=/ and has no Domain, so no sibling subdomain can set or
 * overwrite it. It needs HTTPS, so plain names are used on a local dev server.
 */
export const COOKIES = {
  session: '__Host-tartame_session',
  csrf: '__Host-tartame_csrf',
  twoFactor: '__Host-tartame_2fa',
  /** A customer's session: separate from the team's, never the same cookie. */
  customer: '__Host-tartame_cuenta',
  /** The state, nonce and PKCE verifier of a sign-in in progress. */
  signIn: '__Host-tartame_entrar',
} as const;

export const DEV_COOKIES = {
  session: 'tartame_session',
  csrf: 'tartame_csrf',
  twoFactor: 'tartame_2fa',
  customer: 'tartame_cuenta',
  signIn: 'tartame_entrar',
} as const;

/** Every admin form carries the CSRF token in this field. */
export const CSRF_FIELD = 'csrfToken';

/**
 * Retention periods, in days. The privacy notice prints these same numbers,
 * so the promise and the sweep cannot drift apart.
 */
export const RETENTION_DAYS = {
  /** After delivery (or cancellation): names, addresses, phones, messages, the photo. */
  orders: 90,
  /** An order that was never paid: deleted outright. */
  unpaidOrders: 2,
  /** The panel's activity log. */
  audit: 730,
  /** Stripe event ids, kept to ignore repeats (Stripe retries for three days). */
  stripeEvents: 30,
  /** A customer account nobody has signed in to for this long is deleted. */
  customerAccounts: 730,
} as const;

/**
 * Consent wording, stored verbatim with each consent so the text someone
 * agreed to can always be shown, even after the copy changes.
 */
export const CONSENT_TEXT = {
  recipient:
    'Los datos de quien recibe la tarta me los ha dado a mí o puedo darlos, y se usan solo para entregársela.',
  marketing: 'Quiero recibir novedades de Tartame por email. Puedo darme de baja cuando quiera.',
} as const;
