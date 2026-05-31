import { isSuperAdmin } from '../config.js';
import { pool } from '../db/pool.js';
import type { AuthContext, UserRole, UserStatus } from '../middleware/auth.js';
import { getDefaultCommunityId } from '../services/community.js';

/**
 * Build an AuthContext for a Telegram user acting through the bot (callback
 * buttons), so bot actions go through the exact same authorized service
 * functions as the Mini App. Returns null if the user has never been seen
 * (no row yet) — bot callbacks always come from someone who has interacted,
 * so this is effectively "unknown actor → reject".
 */
export async function buildBotContext(telegramId: number): Promise<AuthContext | null> {
  const communityId = await getDefaultCommunityId();
  const { rows } = await pool.query<{ id: number; username: string | null; status: UserStatus; role: UserRole }>(
    `SELECT id, username, status, role FROM users WHERE community_id = $1 AND telegram_id = $2`,
    [communityId, telegramId],
  );
  const u = rows[0];
  if (!u) return null;
  return {
    userId: u.id,
    communityId,
    telegramId,
    username: u.username,
    status: u.status,
    role: u.role,
    superAdmin: isSuperAdmin(telegramId),
  };
}
