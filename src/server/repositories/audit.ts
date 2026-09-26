import 'server-only';

import { getDb, isoRequired } from '@/server/db/pg';

export interface AuditEntry {
  id: number;
  actorEmail: string | null;
  action: string;
  target: string | null;
  detail: string | null;
  createdAt: string;
}

/**
 * The activity log: who changed what, when. Append-only — there is no update
 * or delete here, because a log an administrator can rewrite is not a log.
 * `detail` is a short human summary, never a secret and never a customer's
 * personal data (it outlives the order's retention period).
 */
export async function recordAudit(input: {
  actorId: number | null;
  actorEmail: string | null;
  action: string;
  target?: string | null;
  detail?: string | null;
  ipHash?: string | null;
}): Promise<void> {
  await getDb().query(
    `insert into audit_log (actor_id, actor_email, action, target, detail, ip_hash)
     values ($1, $2, $3, $4, $5, $6)`,
    [input.actorId, input.actorEmail, input.action, input.target ?? null, input.detail ?? null, input.ipHash ?? null],
  );
}

export async function listAudit(options: { limit?: number; target?: string } = {}): Promise<AuditEntry[]> {
  const limit = Math.min(Math.max(options.limit ?? 150, 1), 500);
  const { rows } = await getDb().query<{
    id: number;
    actor_email: string | null;
    action: string;
    target: string | null;
    detail: string | null;
    created_at: Date;
  }>(
    `select id, actor_email, action, target, detail, created_at
       from audit_log
      where ($2::text is null or target = $2)
      order by created_at desc, id desc
      limit $1`,
    [limit, options.target ?? null],
  );
  return rows.map((r) => ({
    id: r.id,
    actorEmail: r.actor_email,
    action: r.action,
    target: r.target,
    detail: r.detail,
    createdAt: isoRequired(r.created_at),
  }));
}

export async function purgeOldAudit(retentionDays: number): Promise<number> {
  const { rowCount } = await getDb().query(
    `delete from audit_log where created_at < now() - make_interval(days => $1)`,
    [retentionDays],
  );
  return rowCount;
}
