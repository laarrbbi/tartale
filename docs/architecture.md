# Architecture

## The business in one paragraph

Someone sends a cake with a printed photo and a short line to someone's office.
Tartale sells it, takes the order and coordinates; a partner bakery bakes and
delivers it (the first: Levadura Madre, Alicante). Each postcode belongs to one
bakery's delivery zone, so every order knows who bakes it and what delivery
costs. Company birthdays are the same order, created on its own a week ahead
and paid by transfer.

## Code

```
src/
  app/                  pages and API routes (Next.js App Router)
    page.tsx            landing
    enviar/             the 3-step order form
    pedido/[token]/     tracking page (the link is the key)
    admin/              the team's panel
    api/                pedidos (create, pay again, photo), stripe/webhook,
                        cron/limpieza, cron/cumpleanos, health, setup
  components/           UI; admin/ holds the panel's client forms
  lib/                  pure rules, safe in the browser: dates (Madrid), zones,
                        prices, birthdays, statuses, WhatsApp links
  proxy.ts              per-request CSP nonce
  server/
    validation/         zod: every input is parsed here first
    services/           what happens: place an order, pay, refund, birthdays,
                        retention, schema updates
    repositories/       SQL, one file per table family
    auth/ security/     sessions, CSRF, passwords, TOTP, rate limits
    payments/stripe.ts  Stripe over plain fetch (Checkout, refunds, webhooks)
    actions/            the panel's server actions (beginMutation first)
supabase/               schema.sql, migrations/, seed.sql
tests/                  node:test on PGlite (real Postgres in WebAssembly)
```

## An order's life

1. `/enviar` posts JSON to `/api/pedidos`: same-origin check, size cap, rate
   limit, honeypot and time-to-fill, zod.
2. `order-service.placeOrder` checks the switch in Ajustes, the zone for the
   postcode, that the cake is on that bakery's menu in that size, the day
   (notice, far limit, closed weekdays), the photo's bytes — and prices it
   from the database. It stores the order unpaid and opens a Stripe Checkout
   session for exactly that amount; the browser is sent to Stripe.
3. Stripe's webhook (or the return to `/pedido/…?pago=ok`, verified against
   Stripe) marks it paid. An unpaid order never reaches the team's board and
   is deleted after 2 days.
4. The team: Nuevo → Confirmado (a prefilled WhatsApp to the sender with the
   tracking link) → En el horno (brief to the bakery, photo download, A6 card)
   → De camino → Entregado. The sender follows it at `/pedido/<link>`.
5. 90 days after the delivery day, the nightly job erases the people and keeps
   the cake, the day and the money.

Money is integer cents throughout; days are `YYYY-MM-DD` in Europe/Madrid.

## Company birthdays

`companies` (who pays, who we talk to) and `birthdays` (one row per person: day
and month, address, cake, size, the words with `{nombre}`). Every morning
`createDueBirthdayOrders` plans each person's next birthday
(`lib/birthdays.planBirthday`: an office birthday at the weekend goes out on
the Friday; a closed weekday moves it earlier) and, 7 days before it goes out,
inserts a "Nuevo" order paid by transfer. A unique index on
`(birthday_id, birthday_year)` makes a second order for the same birthday
impossible.

## Data model

`bakeries` → `zones` (postcodes, delivery price) and `cakes` (price per size).
`orders` copy what was sold (cake name, price) so a later menu change never
rewrites history; `order_photos` holds the photo apart. `admin_users`,
`sessions`, `audit_log`, `rate_limits`, `settings` (one row),
`stripe_events` (ids already handled), `marketing_contacts` (only with the
box ticked), `companies`, `birthdays`.
