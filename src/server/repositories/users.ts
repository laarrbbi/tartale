import 'server-only';

import { getDb, iso, isoRequired, one } from '@/server/db/pg';
import type { Role } from '@/types/domain';

export interface AdminUserRow {
  id: number;
  email: string;
  password_hash: string;
  display_name: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  failed_attempts: number;
  locked_until: Date | null;
}

const COLUMNS = `id, email, password_hash, display_name, role, is_active, must_change_password,
                 failed_attempts, locked_until`;

export async function findUserByEmail(email: string): Promise<AdminUserRow | null> {
  // Matches admin_users_email_idx on lower(email): an index lookup, not a scan.
  return one<AdminUserRow>(getDb(), `select ${COLUMNS} from admin_users where lower(email) = lower($1)`, [email]);
}

export async function findUserById(id: number): Promise<AdminUserRow | null> {
  return one<AdminUserRow>(getDb(), `select ${COLUMNS} from admin_users where id = $1`, [id]);
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  displayName: string;
  role: Role;
  mustChangePassword?: boolean;
}): Promise<number> {
  const row = await one<{ id: number }>(
    getDb(),
    `insert into admin_users (email, password_hash, display_name, role, must_change_password)
     values ($1, $2, $3, $4, $5) returning id`,
    [input.email, input.passwordHash, input.displayName, input.role, input.mustChangePassword ?? false],
  );
  return row!.id;
}

/** Every failed check counts; the account locks once the budget is spent. */
export async function recordFailedLogin(userId: number, maxAttempts: number, lockSeconds: number): Promise<void> {
  await getDb().query(
    `update admin_users
        set failed_attempts = failed_attempts + 1,
            locked_until = case when failed_attempts + 1 >= $2
                                then now() + make_interval(secs => $3) else locked_until end
      where id = $1`,
    [userId, maxAttempts, lockSeconds],
  );
}

export async function recordSuccessfulLogin(userId: number): Promise<void> {
  await getDb().query(
    'update admin_users set failed_attempts = 0, locked_until = null, last_login_at = now() where id = $1',
    [userId],
  );
}

export async function updatePasswordHash(userId: number, passwordHash: string): Promise<void> {
  await getDb().query(
    `update admin_users
        set password_hash = $1, password_changed_at = now(), must_change_password = false
      where id = $2`,
    [passwordHash, userId],
  );
}

/** A temporary password set by the owner: it must be changed at the next sign-in, and it lifts a lock. */
export async function setTemporaryPassword(userId: number, passwordHash: string): Promise<void> {
  await getDb().query(
    `update admin_users
        set password_hash = $1, password_changed_at = now(), must_change_password = true,
            failed_attempts = 0, locked_until = null
      where id = $2`,
    [passwordHash, userId],
  );
}

export function isLocked(user: Pick<AdminUserRow, 'locked_until'>): boolean {
  return user.locked_until ? new Date(user.locked_until).getTime() > Date.now() : false;
}

export async function countUsers(): Promise<number> {
  return (await one<{ c: number }>(getDb(), 'select count(*)::int as c from admin_users'))?.c ?? 0;
}

/**
 * Recovery from the hosting dashboard (BOOTSTRAP_ADMIN_FORCE): makes `email`
 * an active owner with this password, creating the account if needed. Only
 * whoever controls the deployment's environment can reach it — and they hold
 * the database credentials anyway.
 */
export async function recoverOwner(input: { email: string; passwordHash: string; displayName: string }): Promise<'created' | 'reset'> {
  const existing = await findUserByEmail(input.email);
  if (!existing) {
    await createUser({ ...input, role: 'owner' });
    return 'created';
  }
  await getDb().query(
    `update admin_users
        set password_hash = $1, role = 'owner', is_active = true, must_change_password = false,
            failed_attempts = 0, locked_until = null, password_changed_at = now()
      where id = $2`,
    [input.passwordHash, existing.id],
  );
  return 'reset';
}

export interface AdminAccount {
  id: number;
  email: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  twoFactor: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export async function listAdminAccounts(): Promise<AdminAccount[]> {
  const { rows } = await getDb().query<{
    id: number;
    email: string;
    display_name: string;
    role: Role;
    is_active: boolean;
    totp_enabled_at: Date | null;
    last_login_at: Date | null;
    created_at: Date;
  }>(
    `select id, email, display_name, role, is_active, totp_enabled_at, last_login_at, created_at
       from admin_users order by is_active desc, created_at`,
  );
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    role: r.role,
    isActive: r.is_active,
    twoFactor: r.totp_enabled_at !== null,
    lastLoginAt: iso(r.last_login_at),
    createdAt: isoRequired(r.created_at),
  }));
}

export async function setAccountActive(id: number, active: boolean): Promise<void> {
  await getDb().query('update admin_users set is_active = $1 where id = $2', [active, id]);
}

export async function countActiveOwners(): Promise<number> {
  return (
    (await one<{ c: number }>(getDb(), `select count(*)::int as c from admin_users where role = 'owner' and is_active`))
      ?.c ?? 0
  );
}

// ---------------------------------------------------------------------------
// Two-step verification (TOTP)
// ---------------------------------------------------------------------------

export interface TotpState {
  secret: string | null;
  enabled: boolean;
}

export async function getTotp(userId: number): Promise<TotpState | null> {
  const row = await one<{ totp_secret: string | null; totp_enabled_at: Date | null }>(
    getDb(),
    'select totp_secret, totp_enabled_at from admin_users where id = $1',
    [userId],
  );
  if (!row) return null;
  return { secret: row.totp_secret, enabled: row.totp_enabled_at !== null && row.totp_secret !== null };
}

/** A secret not yet in force: it only counts once a code from it is confirmed. */
export async function setPendingTotp(userId: number, secret: string): Promise<void> {
  await getDb().query(
    'update admin_users set totp_secret = $1, totp_enabled_at = null, totp_last_step = null where id = $2',
    [secret, userId],
  );
}

export async function enableTotp(userId: number, step: number): Promise<void> {
  await getDb().query('update admin_users set totp_enabled_at = now(), totp_last_step = $1 where id = $2', [step, userId]);
}

export async function disableTotp(userId: number): Promise<void> {
  await getDb().query(
    'update admin_users set totp_secret = null, totp_enabled_at = null, totp_last_step = null where id = $1',
    [userId],
  );
}

/**
 * Accepts a code's time step at most once. The conditional update is the
 * whole replay defence: two requests racing with one code both run it, and
 * only one changes a row.
 */
export async function claimTotpStep(userId: number, step: number): Promise<boolean> {
  const { rowCount } = await getDb().query(
    `update admin_users set totp_last_step = $2
      where id = $1 and (totp_last_step is null or totp_last_step < $2)`,
    [userId, step],
  );
  return rowCount === 1;
}
