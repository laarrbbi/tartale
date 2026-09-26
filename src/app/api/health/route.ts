import { NextResponse } from 'next/server';

import { configProblems } from '@/lib/env-check';

export const dynamic = 'force-dynamic';

const HEALTHY_FOR_MS = 10_000;
let healthyUntil = 0;

/**
 * For the uptime check: can this deployment reach its database? Answers a
 * status word, never a version or a stack, and names missing settings by name
 * only. A healthy answer is reused for a few seconds so looping on the URL
 * cannot turn into load on the database.
 */
export async function GET(): Promise<NextResponse> {
  const headers = { 'cache-control': 'no-store' };
  const config = configProblems();
  if (config.length > 0) {
    return NextResponse.json({ status: 'misconfigured', config }, { status: 503, headers });
  }
  if (Date.now() < healthyUntil) return NextResponse.json({ status: 'ok' }, { headers });
  try {
    const { getDb } = await import('@/server/db/pg');
    await getDb().query('select 1 from settings where id = 1');
    healthyUntil = Date.now() + HEALTHY_FOR_MS;
    return NextResponse.json({ status: 'ok' }, { headers });
  } catch (error) {
    console.error('[health] database unreachable', error);
    return NextResponse.json({ status: 'degraded' }, { status: 503, headers });
  }
}
