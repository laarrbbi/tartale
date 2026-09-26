import { cronAuthorized } from '@/server/http/cron';
import { createDueBirthdayOrders } from '@/server/services/birthday-service';

/** Every morning: the orders for company birthdays due in the next week (vercel.json → crons). */
export async function GET(request: Request): Promise<Response> {
  if (!cronAuthorized(request)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const run = await createDueBirthdayOrders();
    return Response.json({ ok: true, created: run.created.length, problems: run.problems.length });
  } catch (error) {
    console.error('[cron] birthdays failed', error instanceof Error ? error.message : error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
