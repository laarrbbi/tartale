# Operations

How Tartame runs, and what to do when something needs doing. Production is the
Vercel project `tartale` (region `cdg1`, Paris), deploying every push to the
`claude/upbeat-planck-nhdxq0` branch, with its database on Supabase (Frankfurt,
`eu-central-1`).

## Environment variables (Vercel → tartale → Settings → Environment Variables)

| Variable | Needed | What it is |
| --- | --- | --- |
| `DATABASE_URL` | yes | Supabase transaction pooler, port 6543. |
| `SESSION_SECRET`, `IP_HASH_SECRET` | yes | 32+ random characters each, different. Changing `SESSION_SECRET` signs everyone out. |
| `CRON_SECRET` | yes | Vercel sends it to the nightly jobs. Without it nothing is erased at 90 days and no birthday is ordered. |
| `STRIPE_SECRET_KEY` | to sell | `sk_test_…` to try, `sk_live_…` (or a restricted `rk_live_…`) to sell. Without it the form says payments are off. |
| `STRIPE_WEBHOOK_SECRET` | to sell | The signing secret of the webhook endpoint (below). |
| `APP_ORIGIN` | no | Defaults to the production domain. Set it when a custom domain is added, e.g. `https://tartame.es`. |
| `BOOTSTRAP_ADMIN_*` | once | First owner account, or recovery (below). Remove after use. |
| `SETUP_SECRET` | once | Lets `POST /api/setup` create the tables in an empty database. Remove after use. |

Mark every secret **Sensitive**. A change applies on the next deployment
(Deployments → ⋯ → Redeploy).

## Stripe

1. Dashboard → Developers → API keys: copy the secret key into
   `STRIPE_SECRET_KEY`.
2. Developers → Webhooks → Add endpoint:
   `https://tartale.vercel.app/api/stripe/webhook`, events
   `checkout.session.completed`, `checkout.session.expired`,
   `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `charge.refunded`.
   Copy its signing secret (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`.
3. Redeploy. Ajustes → Puesta a punto shows both in green.

Test and live mode have separate keys *and* separate webhook endpoints: do both
steps again when switching to live. Refunds are made from the order page in
the panel (they call Stripe); a refund made in Stripe's own dashboard also
reaches the order through the webhook.

## Panel accounts

- **First owner:** set `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`
  (12+ characters) and optionally `BOOTSTRAP_ADMIN_NAME`, redeploy, open any
  page. The account is created only while the database has no accounts.
- **Everyone else:** Equipo → Dar acceso a alguien. A temporary password is
  shown once; the person must choose their own at first sign-in.
- **Forgotten password:** an owner presses "Nueva contraseña" for that
  account in Equipo (this also switches off their two-step verification).
- **Locked out entirely:** set the `BOOTSTRAP_ADMIN_*` variables plus
  `BOOTSTRAP_ADMIN_FORCE=1`, redeploy, sign in, then **remove all of them** and
  redeploy again — while `FORCE` is set, every cold start resets that password.

## Nightly jobs (vercel.json)

| Path | When (UTC) | What |
| --- | --- | --- |
| `/api/cron/limpieza` | 03:10 | Erases names, addresses, phones, emails, messages and photos 90 days after the delivery day; deletes web orders never paid after 2 days; prunes sessions, rate-limit counters, Stripe event ids (30 days) and the activity log (2 years). |
| `/api/cron/cumpleanos` | 05:05 | Creates each company-birthday order 7 days before it goes out, as "Nuevo". |

Both refuse any call without `Authorization: Bearer $CRON_SECRET`. To run one
by hand: Vercel → tartale → Settings → Cron Jobs → Run. Their results are in
the function logs; the panel's Actividad shows erasures and birthday problems.

## Database

- **A fresh database:** `POST /api/setup` with `Authorization: Bearer
  $SETUP_SECRET` applies `supabase/schema.sql` and `supabase/seed.sql` in one
  transaction (both are idempotent), then remove `SETUP_SECRET`. Or paste the
  two files into Supabase's SQL editor.
- **Updates:** a version that needs a database change lists it in Ajustes →
  Base de datos; the owner presses "Actualizar la base de datos". The app never
  migrates on its own. The same SQL is in `supabase/migrations/`.
- **Supabase's public API is closed:** every table has row-level security and
  the `anon`/`authenticated` roles hold no grants; the app connects as the
  database owner through the pooler. Creating a table by hand in Supabase's
  dashboard reopens that door until "Actualizar la base de datos" is pressed
  (Puesta a punto goes amber when that happens).

## Backups

`.github/workflows/backup.yml` runs every night at 02:17 UTC: `pg_dump` of the
`public` schema through the session pooler (port 5432), a check that all 14
tables are in it, and encryption with AES-256 before it is uploaded as a
workflow artifact kept **30 days**. The repository is public, so the artifact
is only as private as the passphrase.

Setup (GitHub → laarrbbi/tartale → Settings → Secrets and variables → Actions
→ New repository secret):

- `DATABASE_URL`: the same value as in Vercel.
- `BACKUP_PASSPHRASE`: 24+ random characters. **Keep a copy outside GitHub**
  (a password manager): without it no backup can be read.

Then Actions → Backup → Run workflow once to see it pass.

Restoring (into an empty database, or over the current one):

```bash
# Download the artifact from the run (Actions → Backup → run → Artifacts), unzip it.
gpg --decrypt tartale-2026-10-01T0217Z.dump.gpg > tartale.dump
# Session pooler (port 5432), not the transaction pooler.
pg_restore --no-owner --no-privileges --clean --if-exists \
  --dbname "postgresql://postgres.<ref>:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres" \
  tartale.dump
```

`pg_restore` may report `schema "public" already exists`: harmless. Afterwards
press "Actualizar la base de datos" in Ajustes to re-check the public API
lock-down, and delete `tartale.dump`.

## Uptime

`.github/workflows/uptime.yml` checks the home page, `/enviar` and
`/api/health` (which also queries the database) every 15 minutes. A failure
shows in the Actions tab. For an email, turn on GitHub → Settings →
Notifications → Actions → "Send notifications for failed workflows only".
GitHub pauses scheduled workflows in a repository with no activity for 60
days; Actions shows a button to turn them back on.

## Personal data, by hand

- Someone asks to be erased before the 90 days: open the order → "Borrar los
  datos personales".
- Someone leaves a company's birthday list: Cumpleaños → the company → the
  person → Editar → "Quitar de la lista".
- A company stops the service: Cumpleaños → the company → "Borrar la empresa".
- Someone who ticked "novedades" asks to be removed: until there is a button
  for it, delete their row in Supabase → Table editor → `marketing_contacts`.
