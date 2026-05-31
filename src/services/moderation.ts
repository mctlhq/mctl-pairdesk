import { config } from '../config.js';
import { pool } from '../db/pool.js';
import type { AuthContext, UserStatus } from '../middleware/auth.js';
import { AppError } from '../middleware/errors.js';
import { type InlineButton, notify, openAppButton } from '../telegram/bot.js';
import { audit } from './audit.js';

function canModerate(ctx: AuthContext): boolean {
  return ctx.superAdmin || ctx.role === 'moderator' || ctx.role === 'admin';
}

/** Current status of a user in a community, or null if not found. Used by the
 * bot's join-request buttons to stay idempotent against stale keyboards. */
export async function getUserStatus(communityId: number, userId: number): Promise<UserStatus | null> {
  const { rows } = await pool.query<{ status: UserStatus }>(
    `SELECT status FROM users WHERE id = $1 AND community_id = $2`,
    [userId, communityId],
  );
  return rows[0]?.status ?? null;
}

const STATUS_ACTION: Record<string, string> = {
  approved: 'admin.user_approved',
  rejected: 'admin.user_rejected',
  blocked: 'admin.user_blocked',
};

/**
 * Moderator/admin transition of a target user's status, with RBAC + audit +
 * a notification to the affected user. Shared by the admin REST route and the
 * bot's approve/reject callback buttons so both enforce the same rules.
 * Returns the target's telegram_id (for the caller to act on if needed).
 */
export async function setUserStatus(
  ctx: AuthContext,
  targetUserId: number,
  status: UserStatus,
  notifyText?: string,
): Promise<number> {
  if (!canModerate(ctx)) throw new AppError(403, 'moderator role required');
  const { rows } = await pool.query<{ telegram_id: number }>(
    `UPDATE users SET status = $3, updated_at = now()
      WHERE id = $1 AND community_id = $2 RETURNING telegram_id`,
    [targetUserId, ctx.communityId, status],
  );
  if (rows.length === 0) throw new AppError(404, 'user not found');
  await audit({
    communityId: ctx.communityId,
    actorUserId: ctx.userId,
    action: STATUS_ACTION[status] ?? `admin.user_${status}`,
    targetType: 'user',
    targetId: targetUserId,
  });
  const tg = rows[0]!.telegram_id;
  if (notifyText && tg) {
    const openBtn = status === 'approved' ? openAppButton() : null;
    void notify(tg, notifyText, openBtn ? [[openBtn]] : undefined);
  }
  return tg;
}

/**
 * Notify all community moderators/admins (plus the env super-admins) that a new
 * user is awaiting approval, with inline Approve/Reject buttons. Best-effort.
 */
export async function notifyAdminsOfNewUser(
  communityId: number,
  newUserId: number,
  label: string,
): Promise<void> {
  const { rows } = await pool.query<{ telegram_id: number }>(
    `SELECT telegram_id FROM users
      WHERE community_id = $1 AND status = 'approved' AND role IN ('moderator','admin')`,
    [communityId],
  );
  const recipients = new Set<string>(rows.map((r) => String(r.telegram_id)));
  for (const id of config.superAdminIds) recipients.add(id);
  if (recipients.size === 0) return;

  // label can carry user-controlled text (first/last name) in future callers, and
  // notify() uses parse_mode HTML — escape the HTML metacharacters so a name can
  // never break Bot API parsing (or inject markup).
  const safeLabel = label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const text = `New join request: <b>${safeLabel}</b>\nApprove this member?`;
  const buttons: InlineButton[][] = [
    [
      { text: '✓ Approve', callback_data: `approve_user:${newUserId}` },
      { text: '✗ Reject', callback_data: `reject_user:${newUserId}` },
    ],
  ];
  for (const tg of recipients) void notify(tg, text, buttons);
}
