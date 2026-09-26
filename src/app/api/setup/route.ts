import fs from 'node:fs/promises';
import path from 'node:path';

import { NextResponse } from 'next/server';

import { getDb } from '@/server/db/pg';
import { recordAudit } from '@/server/repositories/audit';
import { safeEqual } from '@/server/security/hash';
import { bootstrapFirstAdmin } from '@/server/services/bootstrap';
import { schemaStatus } from '@/server/services/schema-updates';

export const dynamic = 'force-dynamic';

/**
 * First-time setup of an empty database: supabase/schema.sql, then
 * supabase/seed.sql, in one transaction, then the first owner account if the
 * BOOTSTRAP_ADMIN_* variables ask for one.
 *
 * It exists because a brand-new database has no panel to press a button in:
 * later changes go through Ajustes → Base de datos like any other update.
 * Off unless SETUP_SECRET is set (32+ characters), and it only runs for a
 * request carrying that secret. Both files are idempotent, so a second call
 * changes nothing. Remove SETUP_SECRET once the database is set up.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const headers = { 'cache-control': 'no-store' };
  const secret = process.env.SETUP_SECRET?.trim() ?? '';
  if (secret.length < 32) return NextResponse.json({ error: 'not found' }, { status: 404, headers });

  const offered = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!safeEqual(offered, secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers });

  const dir = path.join(process.cwd(), 'supabase');
  const [schema, seed] = await Promise.all([
    fs.readFile(path.join(dir, 'schema.sql'), 'utf8'),
    fs.readFile(path.join(dir, 'seed.sql'), 'utf8'),
  ]);

  await getDb().transaction(async (tx) => {
    await tx.query(schema);
    await tx.query(seed);
  });
  await bootstrapFirstAdmin();
  await recordAudit({ actorId: null, actorEmail: null, action: 'setup.schema', detail: 'schema.sql + seed.sql' });

  const tables = await getDb().query<{ tablename: string; rowsecurity: boolean }>(
    `select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename`,
  );
  return NextResponse.json({ ok: true, tables: tables.rows, updates: await schemaStatus() }, { headers });
}
