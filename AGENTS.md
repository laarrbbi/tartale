<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working on Tartame

- Everything a customer reads is Spanish (Spain). Code, comments and commits are English.
- Never invent facts on the site: no statistics, testimonials, prices, serving
  sizes or delivery promises that the owner has not given. Prices come from the
  database (the bakeries' menus), never from the browser.
- Money is integer cents. Dates are `YYYY-MM-DD` strings in Europe/Madrid.
- Queries live in `src/server/repositories/` (the session, rate-limit and
  schema-update plumbing keep their own). Every untrusted input goes through a
  zod schema in `src/server/validation/` first.
- Panel mutations are server actions that start with `beginMutation()` (CSRF,
  role, rate limit); forms go through `AdminForm`. `tests/security.test.ts`
  reads the source and fails if one does not.
- Schema changes: add an idempotent entry to `src/server/services/schema-updates.ts`,
  the same SQL as a file in `supabase/migrations/`, and fold it into
  `supabase/schema.sql`. `tests/schema.test.ts` fails if the three disagree.
  Never migrate at boot.
- Before every push: `npm run typecheck && npm test && npm run build`.
