# Customer sign-in: Google, Apple, Microsoft

Customers can have an account, optionally: their orders in one place, and the
order form filled in with their details (and their company's invoice details)
each time. There are no passwords. Google, Apple or Microsoft confirm who the
person is, and the site keeps the provider's id for them, the email address it
gave, and whatever the customer saves.

Nothing changes for anyone until a provider is switched on: with no keys set,
there is no "Entrar" link, `/entrar` says accounts are not open yet, and every
order is a guest order, exactly as before.

## Switching it on

1. In the panel, **Ajustes → Base de datos → «Actualizar la base de datos»**.
   This creates the accounts tables (update `20261004120000_customer_accounts`).
2. Register the site with one or more providers (below). Each one asks for a
   return URL; **Ajustes → Cuentas de clientes** lists them. For the current
   address they are:
   - `https://tartame.vercel.app/api/cuenta/entrar/google/vuelta`
   - `https://tartame.vercel.app/api/cuenta/entrar/apple/vuelta`
   - `https://tartame.vercel.app/api/cuenta/entrar/microsoft/vuelta`

   If the site moves to its own domain later, register the new URLs too
   (and set `APP_ORIGIN`).
3. Put the keys in **Vercel → tartame → Settings → Environment Variables**
   (Production; mark secrets *Sensitive*), then redeploy. A provider's button
   appears once all of its variables are set.

### Google

Google Cloud Console (console.cloud.google.com), in a project for Tartame:

1. **Google Auth Platform → Branding**: app name *Tartame*, a support email,
   and `tartame.vercel.app` as an authorized domain.
2. **Audience**: *External*, then publish the app. Only the basic scopes are
   asked for (`openid email profile`).
3. **Clients → Create client → Web application**, with the Google return URL
   above as an *Authorized redirect URI*.
4. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`.

### Apple

Needs a membership of the Apple Developer Program. In Certificates, Identifiers
& Profiles (developer.apple.com/account):

1. **Identifiers → App IDs**: an App ID with *Sign in with Apple* enabled.
2. **Identifiers → Services IDs**: a new one (for example `es.tartame.web`),
   with *Sign in with Apple* enabled and configured with that App ID, the
   domain `tartame.vercel.app` and the Apple return URL above.
3. **Keys**: a new key with *Sign in with Apple*, for that App ID. Download the
   `.p8` file (Apple lets you do it once) and note the key's ID.
4. Set `APPLE_CLIENT_ID` (the Services ID), `APPLE_TEAM_ID` (in Membership
   details), `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY` (the whole text of the
   `.p8` file, including the BEGIN and END lines).

Apple lets people hide their address; the account then gets an Apple relay
address. The site sends no email today. If it ever does, the sending domain
has to be registered with Apple's private relay first.

### Microsoft

Microsoft Entra admin center (entra.microsoft.com):

1. **App registrations → New registration**: name *Tartame*; supported
   accounts *any organizational directory and personal Microsoft accounts*;
   redirect URI of type *Web*, the Microsoft return URL above.
2. **Token configuration → Add optional claim → ID → email**, so work
   accounts send their address.
3. **Certificates & secrets → New client secret**. Copy its *Value* (not its
   ID). Secrets expire (24 months at most): note the date and make a new one
   before then.
4. Set `MICROSOFT_CLIENT_ID` (the *Application (client) ID* on the overview)
   and `MICROSOFT_CLIENT_SECRET`.

## How it works

- `/api/cuenta/entrar/{provider}` sends the person to the provider with a
  random `state`, a `nonce` and, for Google and Microsoft, a PKCE challenge;
  the three travel in a signed cookie that lasts ten minutes
  (`src/server/auth/oidc.ts`).
- `/api/cuenta/entrar/{provider}/vuelta` checks that cookie and the `state`,
  exchanges the code with the client secret (for Apple, a short ES256 token
  signed with the `.p8` key), and verifies the ID token: RS256 signature
  against the provider's published keys, issuer, audience, expiry, nonce.
  Apple answers with a POST from its own site; it is the only cross-site POST
  the site accepts, and the signed state cookie is what guards it.
- Accounts are joined by email only when Google or Apple vouch for the
  address. Microsoft lets any directory admin put any address on a user, so a
  Microsoft sign-in always keeps its own account.
- Customer sessions are their own cookie (`__Host-tartame_cuenta`, 30 days)
  and table, apart from the team's. The account's forms carry a CSRF token
  derived from the session and pass the same-origin check.
- An order placed while signed in is linked to the account, and its sender
  and invoice details are saved for the next one. Deleting the account (from
  `/cuenta`) unlinks its orders; the nightly sweep deletes accounts nobody has
  signed in to for two years (`RETENTION_DAYS.customerAccounts`).

## Trying it locally

`scripts/oidc-mock.mjs` stands in for the three providers:

```sh
node scripts/oidc-mock.mjs        # http://localhost:3310
```

and the dev server runs with `OIDC_MOCK_ORIGIN=http://localhost:3310` plus any
values for the provider variables (Apple's key must be a real P-256 key in PEM;
`node -e "console.log(require('crypto').generateKeyPairSync('ec',{namedCurve:'P-256'}).privateKey.export({format:'pem',type:'pkcs8'}))"`).
A production build ignores `OIDC_MOCK_ORIGIN`.
