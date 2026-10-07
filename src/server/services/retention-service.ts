import 'server-only';

import { RETENTION_DAYS } from '@/lib/constants';
import { madridToday } from '@/lib/dates';
import { pruneExpiredSessions } from '@/server/auth/session';
import { purgeOldAudit, recordAudit } from '@/server/repositories/audit';
import { customerAccountsReady, deleteInactiveCustomers, pruneCustomerSessions } from '@/server/repositories/customers';
import { deleteAbandonedOrders, eraseOrder, findOrdersToErase, pruneStripeEvents } from '@/server/repositories/orders';
import { pruneRateLimits } from '@/server/security/rate-limit';

export interface RetentionRun {
  /** Orders whose people were erased: 90 days after the delivery day. */
  erased: number;
  /** Web orders never paid, deleted whole after two days. */
  abandoned: number;
  sessions: number;
  /** Customer accounts nobody signed in to for two years, deleted whole. */
  customerAccounts: number;
  customerSessions: number;
  rateLimits: number;
  audit: number;
  stripeEvents: number;
}

/**
 * The nightly sweep, the promise in the privacy notice kept by a machine:
 * names, addresses, phones, messages and the photo go 90 days after delivery;
 * what was sold, when and for how much stays for the books. A customer
 * account nobody has signed in to for two years goes too.
 */
export async function runRetention(today: string = madridToday()): Promise<RetentionRun> {
  let erased = 0;
  for (const id of await findOrdersToErase(RETENTION_DAYS.orders, today)) {
    if (await eraseOrder(id)) erased++;
  }
  // Until the owner applies the accounts update there are no accounts to sweep.
  const accounts = await customerAccountsReady();
  const run: RetentionRun = {
    erased,
    abandoned: await deleteAbandonedOrders(RETENTION_DAYS.unpaidOrders),
    sessions: await pruneExpiredSessions(),
    customerAccounts: accounts ? await deleteInactiveCustomers(RETENTION_DAYS.customerAccounts) : 0,
    customerSessions: accounts ? await pruneCustomerSessions() : 0,
    rateLimits: await pruneRateLimits(),
    audit: await purgeOldAudit(RETENTION_DAYS.audit),
    stripeEvents: await pruneStripeEvents(RETENTION_DAYS.stripeEvents),
  };
  if (run.erased > 0 || run.abandoned > 0 || run.customerAccounts > 0) {
    await recordAudit({
      actorId: null,
      actorEmail: null,
      action: 'retention.run',
      detail:
        `Datos personales borrados de ${run.erased} pedidos; ${run.abandoned} pedidos sin pagar eliminados` +
        (run.customerAccounts > 0 ? `; ${run.customerAccounts} cuentas sin uso borradas` : ''),
    });
  }
  return run;
}
