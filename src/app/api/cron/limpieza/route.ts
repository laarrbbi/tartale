import { cronAuthorized } from '@/server/http/cron';
import { runRetention } from '@/server/services/retention-service';

/** Every night: the 90-day erasure and the housekeeping (vercel.json → crons). */
export async function GET(request: Request): Promise<Response> {
  if (!cronAuthorized(request)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  try {
    return Response.json({ ok: true, ...(await runRetention()) });
  } catch (error) {
    console.error('[cron] retention failed', error instanceof Error ? error.message : error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
