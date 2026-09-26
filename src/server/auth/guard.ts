import 'server-only';

import { redirect } from 'next/navigation';

import { getSession, type ActiveSession } from './session';

/**
 * Gate for every panel page. Redirects rather than rendering an error, so a
 * visitor never learns whether a given panel URL exists.
 *
 * An account on a temporary password is sent to change it before anything
 * else (`allowPasswordChange` lets the one page that does it through).
 */
export async function requireSession(options: { allowPasswordChange?: boolean } = {}): Promise<ActiveSession> {
  const session = await getSession();
  if (!session) redirect('/admin/login');
  if (session.user.mustChangePassword && !options.allowPasswordChange) redirect('/admin/cuenta');
  return session;
}

/** Owner-only pages. Staff see the orders and the bakeries, not the settings or the money. */
export async function requireOwner(): Promise<ActiveSession> {
  const session = await requireSession();
  if (session.user.role !== 'owner') redirect('/admin');
  return session;
}
