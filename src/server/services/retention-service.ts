import 'server-only';

import { RETENTION_DAYS } from '@/lib/constants';
import { madridToday } from '@/lib/dates';
import { pruneExpiredSessions } from '@/server/auth/session';
import { purgeOldAudit, recordAudit } from '@/server/repositories/audit';
import { deleteAbandonedOrders, eraseOrder, findOrdersToErase, pruneStripeEvents } from '@/server/repositories/orders';
import { pruneRateLimits } from '@/server/security/rate-limit';

export interface RetentionRun {
  /** Orders whose people were erased: 90 days after the delivery day. */
  erased: number;
  /** Web orders never paid, deleted whole after two days. */
  abandoned: number;
  sessions: number;
  rateLimits: number;
  audit: number;
  stripeEvents: number;
}

/**
 * The nightly sweep, the promise in the privacy notice kept by a machine:
 * names, addresses, phones, messages and the photo go 90 days after delivery;
 * what was sold, when and for how much stays for the books.
 */
export async function runRetention(today: string = madridToday()): Promise<RetentionRun> {
  let erased = 0;
  for (const id of await findOrdersToErase(RETENTION_DAYS.orders, today)) {
    if (await eraseOrder(id)) erased++;
  }
  const run: RetentionRun = {
    erased,
    abandoned: await deleteAbandonedOrders(RETENTION_DAYS.unpaidOrders),
    sessions: await pruneExpiredSessions(),
    rateLimits: await pruneRateLimits(),
    audit: await purgeOldAudit(RETENTION_DAYS.audit),
    stripeEvents: await pruneStripeEvents(RETENTION_DAYS.stripeEvents),
  };
  if (run.erased > 0 || run.abandoned > 0) {
    await recordAudit({
      actorId: null,
      actorEmail: null,
      action: 'retention.run',
      detail: `Datos personales borrados de ${run.erased} pedidos; ${run.abandoned} pedidos sin pagar eliminados`,
    });
  }
  return run;
}
