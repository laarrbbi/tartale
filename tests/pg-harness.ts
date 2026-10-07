/**
 * Real Postgres for the tests, with no network: PGlite is the Postgres engine
 * compiled to WebAssembly, so the SQL the repositories send is executed by
 * the same planner that runs it in production.
 */
import fs from 'node:fs';
import path from 'node:path';

import { PGlite, types } from '@electric-sql/pglite';

import { getDb, setTestDb, type Db, type QueryResult } from '../src/server/db/pg';

export const SCHEMA_SQL = fs.readFileSync(path.join(process.cwd(), 'supabase', 'schema.sql'), 'utf8');
export const SEED_SQL = fs.readFileSync(path.join(process.cwd(), 'supabase', 'seed.sql'), 'utf8');

interface PgliteLike {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }>;
  exec: (text: string) => Promise<unknown>;
  transaction: <T>(fn: (tx: PgliteLike) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
}

function adapt(pg: PgliteLike): Db {
  return {
    async query<T>(text: string, params?: readonly unknown[]): Promise<QueryResult<T>> {
      // Parameterless text may hold several statements (a schema file):
      // `exec` runs those, as node-postgres does with the simple protocol.
      if (!params || params.length === 0) {
        if (/;\s*\S/.test(text.trim().replace(/;\s*$/, ''))) {
          const results = (await pg.exec(text)) as Array<{ rows: unknown[]; affectedRows?: number }>;
          const last = results[results.length - 1];
          return { rows: (last?.rows ?? []) as T[], rowCount: last?.affectedRows ?? 0 };
        }
      }
      const r = await pg.query(text, params ? [...params] : undefined);
      return { rows: r.rows as T[], rowCount: r.affectedRows ?? (r.rows as T[]).length };
    },
    transaction: (fn) => pg.transaction((tx) => fn(adapt(tx))),
  };
}

let instance: PGlite | undefined;

/** The same parsers production sets on node-postgres (see src/server/db/pg.ts). */
const parsers = {
  [types.INT8]: (value: string) => Number(value),
  [types.DATE]: (value: string) => value,
};

/** A fresh in-memory Postgres, optionally with the schema, pointed at by the app. */
export async function startTestDb(options: { schema?: boolean } = {}): Promise<Db> {
  instance = await PGlite.create({ parsers });
  if (options.schema !== false) await instance.exec(SCHEMA_SQL);
  const db = adapt(instance as unknown as PgliteLike);
  setTestDb(db);
  return db;
}

export async function stopTestDb(): Promise<void> {
  setTestDb(undefined);
  await instance?.close();
  instance = undefined;
}

const TABLES = [
  'customer_billing',
  'customer_sessions',
  'customer_identities',
  'customers',
  'invoice_lines',
  'invoices',
  'invoice_counters',
  'order_billing',
  'order_photos',
  'order_documents',
  'orders',
  'birthdays',
  'companies',
  'cakes',
  'zones',
  'bakeries',
  'marketing_contacts',
  'stripe_events',
  'sessions',
  'audit_log',
  'admin_users',
  'rate_limits',
  'settings',
];

/** Empties every table (ids restart at 1) and puts back the settings row and the seed. */
export async function resetTestDb(options: { seed?: boolean } = {}): Promise<void> {
  if (!instance) return;
  await instance.exec(`truncate table ${TABLES.join(', ')} restart identity cascade;
    insert into settings (id) values (1);`);
  if (options.seed !== false) await instance.exec(SEED_SQL);
}

export async function sqlOne<T>(text: string, params?: unknown[]): Promise<T | undefined> {
  const { rows } = await getDb().query<T>(text, params);
  return rows[0];
}

export async function sqlAll<T>(text: string, params?: unknown[]): Promise<T[]> {
  return (await getDb().query<T>(text, params)).rows;
}

export async function sqlRun(text: string, params?: unknown[]): Promise<void> {
  await getDb().query(text, params);
}

export async function countRows(table: string, where = '', params: unknown[] = []): Promise<number> {
  return (await sqlOne<{ c: number }>(`select count(*)::int as c from ${table} ${where}`, params))?.c ?? 0;
}
