import 'server-only';

import { cookies } from 'next/headers';

import { COOKIES, DEV_COOKIES, TTL } from '@/lib/constants';
import { isProduction } from '@/lib/env';
import { getDb, one } from '@/server/db/pg';
import { hashIp, hashToken, randomToken, safeEqual } from '@/server/security/hash';
import { getClientIp, getUserAgent } from '@/server/security/request';
import type { Role } from '@/types/domain';

export interface AuthenticatedUser {
  readonly id: number;
  readonly email: string;
  readonly displayName: string;
  readonly role: Role;
  readonly mustChangePassword: boolean;
}

export interface ActiveSession {
  readonly id: number;
  readonly user: AuthenticatedUser;
  readonly csrfToken: string;
}

/** `__Host-` needs HTTPS, so a local HTTP dev server uses plain names. */
const NAMES = isProduction ? COOKIES : DEV_COOKIES;

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: isProduction,
    // `lax` still sends the cookie on a top-level GET from another site (a
    // link to the panel works) and withholds it from cross-site POSTs.
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

/** A fresh session. Always after a successful credential check; an id is never reused. */
export async function createSession(userId: number): Promise<{ csrfToken: string }> {
  const token = randomToken();
  const csrfToken = randomToken();
  const ipHash = hashIp(await getClientIp());
  const ua = (await getUserAgent())?.slice(0, 200) ?? null;

  // The database computes the expiry, so a drifting server clock cannot mint
  // sessions that are already expired or good for longer than the policy.
  await getDb().query(
    `insert into sessions (user_id, token_hash, csrf_hash, ip_hash, user_agent, expires_at)
     values ($1, $2, $3, $4, $5, now() + make_interval(secs => $6))`,
    [userId, hashToken(token), hashToken(csrfToken), ipHash, ua, TTL.sessionAbsolute],
  );

  const jar = await cookies();
  jar.set(NAMES.session, token, cookieOptions(TTL.sessionAbsolute));
  // Readable by script on purpose: the double-submit half of the CSRF pair,
  // worthless without the HttpOnly session cookie beside it.
  jar.set(NAMES.csrf, csrfToken, { ...cookieOptions(TTL.sessionAbsolute), httpOnly: false });
  return { csrfToken };
}

interface SessionRow {
  id: number;
  user_id: number;
  csrf_hash: string;
  last_seen_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  email: string;
  display_name: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
}

/**
 * The current session, enforcing the idle and absolute timeouts. Null for
 * anything that is not a live session: callers cannot tell "expired",
 * "revoked" and "never existed" apart.
 */
export async function getSession(): Promise<ActiveSession | null> {
  const jar = await cookies();
  const token = jar.get(NAMES.session)?.value;
  const csrfToken = jar.get(NAMES.csrf)?.value;
  if (!token || !csrfToken) return null;

  const db = getDb();
  const row = await one<SessionRow>(
    db,
    `select s.id, s.user_id, s.csrf_hash, s.last_seen_at, s.expires_at, s.revoked_at,
            u.email, u.display_name, u.role, u.is_active, u.must_change_password
       from sessions s
       join admin_users u on u.id = s.user_id
      where s.token_hash = $1`,
    [hashToken(token)],
  );
  if (!row || row.revoked_at || !row.is_active) return null;

  const now = Date.now();
  if (new Date(row.expires_at).getTime() <= now) return null;
  if (now - new Date(row.last_seen_at).getTime() > TTL.sessionIdle * 1000) {
    await db.query('update sessions set revoked_at = now() where id = $1', [row.id]);
    return null;
  }
  // The CSRF cookie must belong to this session, not to a stale one.
  if (!safeEqual(hashToken(csrfToken), row.csrf_hash)) return null;

  // Touch at most once a minute: every page view is otherwise a write.
  if (now - new Date(row.last_seen_at).getTime() > 60_000) {
    await db.query('update sessions set last_seen_at = now() where id = $1', [row.id]);
  }

  return {
    id: row.id,
    csrfToken,
    user: {
      id: row.user_id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      mustChangePassword: row.must_change_password,
    },
  };
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(NAMES.session)?.value;
  if (token) {
    await getDb().query('update sessions set revoked_at = now() where token_hash = $1', [hashToken(token)]);
  }
  // Overwritten with an expired value carrying the same attributes: the
  // instruction browsers act on reliably.
  jar.set(NAMES.session, '', { ...cookieOptions(0), maxAge: 0 });
  jar.set(NAMES.csrf, '', { ...cookieOptions(0), maxAge: 0, httpOnly: false });
}

/** Every session of a user: after a password change, 2FA, or deactivation. */
export async function revokeAllSessions(userId: number): Promise<void> {
  await getDb().query('update sessions set revoked_at = now() where user_id = $1 and revoked_at is null', [userId]);
}

/** Housekeeping: rows for sessions that can no longer be used. */
export async function pruneExpiredSessions(): Promise<number> {
  const { rowCount } = await getDb().query(
    `delete from sessions
      where expires_at < now()
         or (revoked_at is not null and revoked_at < now() - interval '30 days')`,
  );
  return rowCount;
}
