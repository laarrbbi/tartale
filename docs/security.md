# Security

What protects Tartale, and where each piece lives. `tests/security.test.ts`
checks most of it on every push.

## Headers and the browser

- **Content-Security-Policy with a nonce** per request (`src/proxy.ts`):
  scripts only with that request's nonce plus `strict-dynamic`; no inline
  script, no `eval` (except on the local dev server); `frame-ancestors 'none'`,
  `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`,
  `connect-src 'self'`.
- **Fixed headers** (`next.config.ts`): HSTS for two years with preload,
  `X-Frame-Options: DENY`, `nosniff`, a strict `Referrer-Policy`, a
  `Permissions-Policy` that denies camera, microphone, geolocation, payment…,
  COOP/CORP same-origin. `/pedido/*`, `/admin/*` and `/api/*` are `noindex`;
  the tracking page sends no referrer at all.
- **Cookies** are `__Host-` (Secure, Path=/, no Domain), HttpOnly for the
  session, SameSite=Lax.

## Requests

- **Same origin on every POST:** the public API routes and every server action
  compare `Origin` (or `Referer`) with `APP_ORIGIN`
  (`src/server/security/request.ts`).
- **CSRF token on every panel form:** a random token bound to the session,
  sent in a hidden field by `AdminForm` and checked in constant time
  (`src/server/auth/csrf.ts`). Every panel action starts with
  `beginMutation()` (CSRF, role, temporary-password gate, rate limit).
- **Rate limits in the database**, per IP (hashed) or per account, shared by
  every serverless instance (`src/server/security/rate-limit.ts`): orders,
  payment retries, tracking reads, logins, panel writes.
- **Bots:** the order form has a honeypot field and a minimum time to fill
  (6 s); both are refused without saying why.
- **Every input is parsed with zod** before it reaches a service
  (`src/server/validation/`): trimmed, length-limited, control characters
  removed, enums checked. Prices never come from the browser: the service
  reads them from the bakery's menu.
- **The photo** is checked by its first bytes (JPEG, PNG or WebP only), at
  most 1.5 MB, stored in the database and served with its own locked-down CSP
  and `nosniff`.
- **Tracking links** are 128 random bits (22 characters); shorter ids are not
  even looked up.

## Accounts

- Passwords: scrypt (N = 65536), a fresh salt each, compared in constant time;
  a dummy hash for unknown emails so response time does not reveal accounts.
  Accounts lock for 15 minutes after 8 failures.
- Optional two-step verification (TOTP, RFC 6238), with each code accepted only
  once.
- Sessions: 8 hours idle, 7 days at most; changing the password or switching
  on two-step verification ends every other session; deactivating an account
  ends all of its sessions.
- Roles: staff run orders and see the bakeries; only owners touch money
  (refunds, cancellations, delivery prices), settings, the catalog, company
  birthdays and accounts. Checked on the server in each action, not by hiding
  buttons.
- The activity log records who changed what, never a customer's personal data.

## Database

- Supabase's REST API is closed: row-level security on every table with no
  policies, and no grants for `anon`/`authenticated`; the app connects directly
  with `pg`, over TLS verified against Supabase's own root CA.
- The app never migrates at boot; the owner applies fixed, idempotent updates
  from Ajustes.
- SQL is always parameterised.

## Personal data (GDPR)

- Recipients' data is used only to deliver the cake. Nobody ever messages the
  recipient: the panel's WhatsApp buttons go to the sender or the bakery.
- 90 days after the delivery day the nightly job erases names, addresses,
  phones, emails, messages, allergies and the photo; unpaid web orders go
  entirely after 2 days. Backups are encrypted and kept 30 days.
- Consent boxes start unticked; news by email only with its own box, stored
  apart with the exact wording shown.

## Reporting a problem

Write to the address on the Aviso legal page. Please do not test against real
customers' orders.
