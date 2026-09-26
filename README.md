# Tartale

**Un email se ignora. Una tarta, no.** Cold cake instead of cold email: a cake
with a printed photo and a short line on top, delivered to someone's office —
a prospect, an investor, a recruiter, a future partner, a client, or someone on
the team. Spain first, starting in Alicante, with partner bakeries that bake
and deliver. Tartale sells, takes the order and coordinates.

Everything a customer reads is in Spanish (Spain).

## Stack

Next.js 16 (App Router) + React 19 + Tailwind v4 · Postgres on Supabase via
`pg` (transaction pooler) · Vercel (region `cdg1`) with Vercel Cron · Stripe
Checkout · `node:test` + PGlite for tests.

## Running it

```bash
npm install
cp .env.example .env.local    # fill it in
npm run dev
```

A fresh database gets `supabase/schema.sql` and then `supabase/seed.sql`
(or `POST /api/setup` with `SETUP_SECRET`, see `.env.example`).

```bash
npm run typecheck
npm test          # rules, security, database (PGlite: real Postgres, no network)
npm run build
```

See [`docs/`](docs/) for architecture, security, operations and the roadmap.
