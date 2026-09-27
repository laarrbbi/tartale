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

const CARD_DESIGN_CHECK = `check (card_design in ('clasica', 'mano', 'color'))`;

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
