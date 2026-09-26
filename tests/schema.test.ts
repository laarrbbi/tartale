import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { after, before } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import { UPDATES, applyPendingSchemaUpdates, schemaStatus } from '../src/server/services/schema-updates';

import { SCHEMA_SQL, SEED_SQL, sqlAll, sqlOne, startTestDb, stopTestDb } from './pg-harness';

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');

/** Everything that makes two databases "the same" for this app. */
async function catalog(pg: PGlite): Promise<unknown> {
  const q = async (sql: string) => (await pg.query(sql)).rows;
  return {
    columns: await q(`select table_name, column_name, data_type, is_nullable, column_default, generation_expression
                        from information_schema.columns where table_schema = 'public'
                       order by table_name, column_name`),
    indexes: await q(`select indexname, indexdef from pg_indexes where schemaname = 'public' order by indexname`),
    constraints: await q(`select conrelid::regclass::text as tbl, conname, pg_get_constraintdef(oid) as def
                            from pg_constraint where connamespace = 'public'::regnamespace
                           order by conrelid::regclass::text, conname`),
    rls: await q(`select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename`),
  };
}

before(() => startTestDb());
after(stopTestDb);

test('the migrations, applied in order, build exactly supabase/schema.sql', async () => {
  const fromSchema = await PGlite.create();
  await fromSchema.exec(SCHEMA_SQL);

  const fromMigrations = await PGlite.create();
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  assert.ok(files.length > 0);
  for (const file of files) await fromMigrations.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));

  assert.deepEqual(await catalog(fromMigrations), await catalog(fromSchema));
  await fromSchema.close();
  await fromMigrations.close();
});

test('every panel database update has a migration file, and none is pending on the schema', async () => {
  const files = fs.readdirSync(MIGRATIONS_DIR);
  for (const update of UPDATES) {
    assert.ok(files.includes(`${update.id}.sql`), `supabase/migrations/${update.id}.sql is missing`);
  }
  assert.deepEqual((await schemaStatus()).filter((s) => !s.applied), []);
  assert.deepEqual(await applyPendingSchemaUpdates(), []);
});

test('Supabase public API: row-level security on every table', async () => {
  const open = await sqlAll<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public' and not rowsecurity`,
  );
  assert.deepEqual(open, []);
});

test('the seed: Levadura Madre, Alicante 03001–03016 and 03540 at 10 €, its menu — and it is safe to re-run', async () => {
  const pg = await PGlite.create();
  await pg.exec(SCHEMA_SQL);
  await pg.exec(SEED_SQL);
  await pg.exec(SEED_SQL);
  const bakery = (await pg.query<{ name: string; prints_photos: boolean }>('select name, prints_photos from bakeries')).rows;
  assert.deepEqual(bakery, [{ name: 'Levadura Madre', prints_photos: true }]);
  const zone = (
    await pg.query<{ codes: number; delivery_cents: number; has_03540: boolean; has_03017: boolean }>(
      `select cardinality(postal_codes) as codes, delivery_cents,
              '03540' = any(postal_codes) as has_03540, '03017' = any(postal_codes) as has_03017
         from zones`,
    )
  ).rows;
  assert.deepEqual(zone, [{ codes: 17, delivery_cents: 1000, has_03540: true, has_03017: false }]);
  const cakes = (await pg.query<{ c: number }>('select count(*)::int as c from cakes')).rows[0]?.c;
  assert.equal(cakes, 8);
  await pg.close();
  // And the default settings row exists in the schema itself.
  assert.equal((await sqlOne<{ id: number }>('select id from settings'))?.id, 1);
});
