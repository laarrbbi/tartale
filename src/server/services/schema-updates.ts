import 'server-only';

import { getDb, one, type Db } from '@/server/db/pg';

/**
 * Database updates the owner applies from the panel (Ajustes → Base de datos).
 *
 * The app never migrates at boot: several serverless instances racing to
 * alter one database is a bad day. Each update here is fixed, idempotent SQL —
 * nothing anyone types reaches it — applied in one transaction when the owner
 * presses the button, and mirrored by a file in supabase/migrations/ and by
 * supabase/schema.sql (tests/schema.test.ts checks all three agree).
 *
 * A fresh database starts from supabase/schema.sql, so the list begins with
 * what can drift after that: the public API lock-down, which has to be
 * re-applied whenever a table is created by hand in Supabase's dashboard.
 */
export interface SchemaUpdate {
  id: string;
  label: string;
  isApplied: (db: Db) => Promise<boolean>;
  /** Run in order, one statement per call. */
  statements: readonly string[];
}

export const LOCK_DOWN_PUBLIC_API = `do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and not rowsecurity loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon')
     and exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema public from anon, authenticated;
    revoke all on all sequences in schema public from anon, authenticated;
    revoke all on all functions in schema public from anon, authenticated;
    alter default privileges in schema public revoke all on tables from anon, authenticated;
    alter default privileges in schema public revoke all on sequences from anon, authenticated;
    alter default privileges in schema public revoke all on functions from anon, authenticated;
  end if;
end $$`;

/** Every table has RLS on, and the API roles hold no grant on any of them. */
export async function publicApiIsClosed(db: Db): Promise<boolean> {
  const row = await one<{ open_tables: number; api_grants: number }>(
    db,
    `select
       (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity) as open_tables,
       (select count(*)::int from information_schema.role_table_grants
         where table_schema = 'public' and grantee in ('anon', 'authenticated')) as api_grants`,
  );
  return (row?.open_tables ?? 1) === 0 && (row?.api_grants ?? 1) === 0;
}

async function hasColumn(db: Db, table: string, column: string): Promise<boolean> {
  return (
    (await one(
      db,
      `select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2`,
      [table, column],
    )) !== null
  );
}

async function hasTable(db: Db, table: string): Promise<boolean> {
  return (await one(db, `select 1 from pg_tables where schemaname = 'public' and tablename = $1`, [table])) !== null;
}

async function hasTrigger(db: Db, table: string, trigger: string): Promise<boolean> {
  return (
    (await one(
      db,
      `select 1 from pg_trigger where tgrelid = to_regclass($1) and tgname = $2 and not tgisinternal`,
      [`public.${table}`, trigger],
    )) !== null
  );
}

const CARD_DESIGN_CHECK = `check (card_design in ('clasica', 'mano', 'color'))`;

/**
 * An issued invoice is never changed or deleted; the only change let through
 * is the database clearing a link to a company or an account that was deleted.
 */
const INVOICES_ARE_FINAL = `create or replace function public.invoices_are_final() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and tg_table_name = 'invoices'
     and (to_jsonb(new) - 'company_id' - 'created_by') = (to_jsonb(old) - 'company_id' - 'created_by') then
    return new;
  end if;
  raise exception 'Una factura emitida no se cambia ni se borra: se corrige con una rectificativa.';
end $$`;

export const UPDATES: readonly SchemaUpdate[] = [
  {
    id: '20260926120000_initial_schema',
    label: 'Cerrar el acceso público de Supabase a las tablas',
    isApplied: publicApiIsClosed,
    statements: [LOCK_DOWN_PUBLIC_API],
  },
  {
    id: '20260927120000_card_designs_and_documents',
    label: 'Diseños de tarjeta y documentos para meter en la caja',
    isApplied: async (db) =>
      (await hasColumn(db, 'orders', 'card_design')) &&
      (await hasColumn(db, 'orders', 'has_document')) &&
      (await hasColumn(db, 'birthdays', 'card_design')) &&
      (await hasTable(db, 'order_documents')) &&
      (await publicApiIsClosed(db)),
    statements: [
      `alter table public.orders add column if not exists card_design text not null default 'clasica' ${CARD_DESIGN_CHECK}`,
      'alter table public.orders add column if not exists has_document boolean not null default false',
      `alter table public.birthdays add column if not exists card_design text not null default 'clasica' ${CARD_DESIGN_CHECK}`,
      `create table if not exists public.order_documents (
         order_id   bigint      primary key references public.orders(id) on delete cascade,
         mime       text        not null check (mime in ('application/pdf', 'image/jpeg', 'image/png')),
         filename   text        not null check (length(filename) between 1 and 120),
         size_bytes integer     not null check (size_bytes > 0),
         bytes      bytea       not null,
         created_at timestamptz not null default now()
       )`,
      LOCK_DOWN_PUBLIC_API,
    ],
  },
  {
    id: '20260928120000_invoices',
    label: 'Facturas: datos fiscales, numeración por series y rectificativas',
    isApplied: async (db) =>
      (await hasColumn(db, 'settings', 'vat_rate_bp')) &&
      (await hasColumn(db, 'settings', 'invoice_note')) &&
      (await hasColumn(db, 'companies', 'tax_city')) &&
      (await hasColumn(db, 'orders', 'invoice_id')) &&
      (await hasTable(db, 'order_billing')) &&
      (await hasTable(db, 'invoice_counters')) &&
      (await hasTable(db, 'invoices')) &&
      (await hasTable(db, 'invoice_lines')) &&
      (await hasTrigger(db, 'invoices', 'invoices_are_final')) &&
      (await hasTrigger(db, 'invoice_lines', 'invoice_lines_are_final')) &&
      (await publicApiIsClosed(db)),
    statements: [
      ...['legal_name', 'tax_id', 'legal_address', 'legal_postal_code', 'legal_city', 'legal_email', 'legal_registry'].map(
        (column) => `alter table public.settings add column if not exists ${column} text`,
      ),
      'alter table public.settings add column if not exists vat_rate_bp integer check (vat_rate_bp between 0 and 10000)',
      'alter table public.settings add column if not exists invoice_note text',
      ...['tax_name', 'tax_id', 'tax_address', 'tax_postal_code', 'tax_city'].map(
        (column) => `alter table public.companies add column if not exists ${column} text`,
      ),
      `create table if not exists public.order_billing (
         order_id    bigint      primary key references public.orders(id) on delete cascade,
         name        text        not null check (length(name) between 1 and 120),
         tax_id      text        not null check (tax_id ~ '^[A-Z0-9]{9}$'),
         address     text        not null,
         postal_code text        not null check (postal_code ~ '^\\d{5}$'),
         city        text        not null,
         created_at  timestamptz not null default now()
       )`,
      `create table if not exists public.invoice_counters (
         series   text     not null check (series in ('F', 'S', 'R')),
         year     smallint not null,
         last_seq integer  not null check (last_seq > 0),
         primary key (series, year)
       )`,
      `create table if not exists public.invoices (
         id               bigint generated always as identity primary key,
         public_id        text        not null unique check (length(public_id) >= 16),
         series           text        not null check (series in ('F', 'S', 'R')),
         year             smallint    not null,
         seq              integer     not null check (seq > 0),
         number           text        not null unique,
         issued_on        date        not null,
         operation_on     date,
         issuer_name      text        not null,
         issuer_tax_id    text        not null,
         issuer_address   text        not null,
         customer_name    text,
         customer_tax_id  text,
         customer_address text,
         replaces_id      bigint      references public.invoices(id),
         rectifies_id     bigint      references public.invoices(id),
         reason           text,
         company_id       bigint      references public.companies(id) on delete set null,
         payment_note     text,
         base_cents       integer     not null,
         vat_cents        integer     not null,
         total_cents      integer     not null,
         created_by       bigint      references public.admin_users(id) on delete set null,
         created_at       timestamptz not null default now(),
         unique (series, year, seq),
         check ((series = 'R') = (rectifies_id is not null)),
         check (series <> 'F' or (customer_name is not null and customer_tax_id is not null and customer_address is not null)),
         check (base_cents + vat_cents = total_cents)
       )`,
      'create index if not exists invoices_issued_idx on public.invoices (issued_on)',
      'create index if not exists invoices_company_idx on public.invoices (company_id) where company_id is not null',
      'create index if not exists invoices_rectifies_idx on public.invoices (rectifies_id) where rectifies_id is not null',
      'create index if not exists invoices_replaces_idx on public.invoices (replaces_id) where replaces_id is not null',
      `create table if not exists public.invoice_lines (
         invoice_id  bigint   not null references public.invoices(id),
         position    smallint not null check (position > 0),
         order_id    bigint   references public.orders(id),
         description text     not null,
         quantity    integer  not null default 1 check (quantity > 0),
         vat_rate_bp integer  not null check (vat_rate_bp between 0 and 10000),
         base_cents  integer  not null,
         vat_cents   integer  not null,
         total_cents integer  not null,
         primary key (invoice_id, position),
         check (base_cents + vat_cents = total_cents)
       )`,
      'create index if not exists invoice_lines_order_idx on public.invoice_lines (order_id) where order_id is not null',
      'alter table public.orders add column if not exists invoice_id bigint references public.invoices(id)',
      'create index if not exists orders_invoice_idx on public.orders (invoice_id) where invoice_id is not null',
      INVOICES_ARE_FINAL,
      'drop trigger if exists invoices_are_final on public.invoices',
      `create trigger invoices_are_final before update or delete on public.invoices
         for each row execute function public.invoices_are_final()`,
      'drop trigger if exists invoice_lines_are_final on public.invoice_lines',
      `create trigger invoice_lines_are_final before update or delete on public.invoice_lines
         for each row execute function public.invoices_are_final()`,
      LOCK_DOWN_PUBLIC_API,
    ],
  },
];

export interface SchemaStatus {
  id: string;
  label: string;
  applied: boolean;
}

export async function schemaStatus(): Promise<SchemaStatus[]> {
  const db = getDb();
  const out: SchemaStatus[] = [];
  for (const update of UPDATES) out.push({ id: update.id, label: update.label, applied: await update.isApplied(db) });
  return out;
}

/** Applies every missing update in one transaction. Returns the labels applied. */
export async function applyPendingSchemaUpdates(): Promise<string[]> {
  const pending = (await schemaStatus()).filter((s) => !s.applied).map((s) => s.id);
  if (pending.length === 0) return [];
  await getDb().transaction(async (tx) => {
    for (const update of UPDATES) {
      if (!pending.includes(update.id)) continue;
      for (const statement of update.statements) await tx.query(statement);
    }
  });
  return UPDATES.filter((u) => pending.includes(u.id)).map((u) => u.label);
}
