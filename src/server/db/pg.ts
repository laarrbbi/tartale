import 'server-only';

import { rootCertificates } from 'node:tls';

import { Pool, types } from 'pg';
import type { PoolConfig } from 'pg';

import { SUPABASE_ROOT_CA } from './supabase-ca';

/**
 * Two type parsers, both about telling the truth consistently.
 *
 * `bigint` (int8) comes back from node-postgres as a string, and from PGlite
 * (the tests) as a number. Left alone, every test would pass with `id === 1`
 * while production compared `'1' === 1`. Row ids here never approach 2^53.
 *
 * `date` comes back as a JavaScript Date at local midnight, which is a
 * timestamp pretending to be a calendar day: `.toISOString()` on it rolls
 * back a day anywhere east of UTC. A delivery date is a calendar day, so it
 * stays the 'YYYY-MM-DD' string Postgres sent.
 */
export const PG_INT8 = 20;
export const PG_DATE = 1082;
types.setTypeParser(PG_INT8, (value) => Number(value));
types.setTypeParser(PG_DATE, (value) => value);

/**
 * The one database interface the server sees. Narrow on purpose: `pg` in
 * production and PGlite in tests both satisfy it, so the repositories run
 * against real Postgres in the tests rather than a mock.
 */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

/**
 * One connection per serverless instance. Postgres counts connections
 * globally, so a pool of 10 across 40 warm instances is 400 connections. This
 * is also why DATABASE_URL must be Supabase's transaction pooler (6543).
 */
const POOL_MAX = Number(process.env.PGPOOL_MAX ?? '1');
const STATEMENT_TIMEOUT_MS = 15_000;

/**
 * TLS, which a hosted database requires and node-postgres does not assume:
 *  - the string carries `sslmode`: the operator decided, `pg` parses it;
 *  - loopback (tests, a local Postgres): no TLS;
 *  - anything else: verified TLS, trusting Node's roots plus Supabase's own.
 * `PGSSL_NO_VERIFY=1` keeps encryption but drops the certificate check — a
 * last resort, since this connection carries names and addresses.
 */
export function sslFor(connectionString: string, noVerify = process.env.PGSSL_NO_VERIFY === '1'): PoolConfig['ssl'] {
  if (/[?&]sslmode=/i.test(connectionString)) return undefined;
  let host = '';
  try {
    host = new URL(connectionString).hostname;
  } catch {
    // Almost always a password with a raw `@` or `/`. Assume remote: guessing
    // "local" would turn a typo into a silent downgrade to plaintext.
    host = '';
  }
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return undefined;
  if (noVerify) return { rejectUnauthorized: false };
  return { rejectUnauthorized: true, ca: [...rootCertificates, SUPABASE_ROOT_CA] };
}

declare global {
  // eslint-disable-next-line no-var
  var __tartamePool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __tartameTestDb: Db | undefined;
}

function poolAdapter(pool: Pool): Db {
  return {
    async query(text, params) {
      const result = await pool.query(text, params as unknown[]);
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    },
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const scoped: Db = {
          async query(text, params) {
            const r = await client.query(text, params as unknown[]);
            return { rows: r.rows, rowCount: r.rowCount ?? 0 };
          },
          // No nested transactions: reuse the one that is already open.
          transaction: (inner) => inner(scoped),
        };
        const out = await fn(scoped);
        await client.query('COMMIT');
        return out;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

/** The database handle; a singleton on globalThis so dev hot reload does not leak pools. */
export function getDb(): Db {
  if (globalThis.__tartameTestDb) return globalThis.__tartameTestDb;

  if (!globalThis.__tartamePool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set. See .env.example.');
    globalThis.__tartamePool = new Pool({
      connectionString,
      ssl: sslFor(connectionString),
      max: POOL_MAX,
      statement_timeout: STATEMENT_TIMEOUT_MS,
      // Supabase closes idle pooler connections; close ours first.
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return poolAdapter(globalThis.__tartamePool);
}

/** Used by the test harness to run everything against PGlite. */
export function setTestDb(db: Db | undefined): void {
  globalThis.__tartameTestDb = db;
}

/** First row, or null. */
export async function one<T>(db: Db, text: string, params?: readonly unknown[]): Promise<T | null> {
  const { rows } = await db.query<T>(text, params);
  return rows[0] ?? null;
}

/** A timestamptz as an ISO string (Postgres hands back a Date). */
export function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export function isoRequired(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
