import type { PoolClient } from '../db/pool.js';
import { pool } from '../db/pool.js';

export interface AuditEntry {
  communityId: number;
  actorUserId: number | null;
  action: string;
  targetType?: string;
  targetId?: number | null;
  meta?: Record<string, unknown>;
}

/**
 * Append an audit row. Covers key USER actions (order/deal lifecycle, contact
 * reveals) as well as admin/moderator actions. Best-effort by default: a failed
 * audit write is logged but never throws into the request path. Pass a `client`
 * to enlist the write in an ongoing transaction (then it shares that txn's fate).
 */
export async function audit(entry: AuditEntry, client?: PoolClient): Promise<void> {
  const q = `INSERT INTO audit_log (community_id, actor_user_id, action, target_type, target_id, meta)
             VALUES ($1, $2, $3, $4, $5, $6)`;
  const params = [
    entry.communityId,
    entry.actorUserId,
    entry.action,
    entry.targetType ?? null,
    entry.targetId ?? null,
    entry.meta ? JSON.stringify(entry.meta) : null,
  ];
  if (client) {
    await client.query(q, params);
    return;
  }
  try {
    await pool.query(q, params);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[audit] write failed', (err as Error).message, entry.action);
  }
}
