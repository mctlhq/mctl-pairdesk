import { isSuperAdmin } from '../config.js';
import { pool } from '../db/pool.js';
import type { UserRole, UserStatus } from '../middleware/auth.js';

export interface UpsertResult {
  id: number;
  status: UserStatus;
  role: UserRole;
  inserted: boolean; // true only on the row's first creation
}

export interface TgUserish {
  id: number;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

/**
 * Upsert a Telegram user in a community and report whether this call created the
 * row. Super-admins (env allowlist) are force-approved with the admin role so the
 * first operator can always get in; everyone else lands 'pending' until approved.
 * Existing status/role are otherwise preserved across logins. Shared by Mini App
 * auth (requireAuth) and the bot /start handler.
 *
 * `inserted` uses Postgres' `xmax = 0` test: on a fresh INSERT the row has no
 * prior version (xmax 0); an ON CONFLICT update leaves xmax non-zero. This lets
 * callers fire the "new join request" admin notification exactly once.
 */
export async function upsertTelegramUser(communityId: number, tg: TgUserish): Promise<UpsertResult> {
  const sa = isSuperAdmin(tg.id);
  const seedStatus: UserStatus = sa ? 'approved' : 'pending';
  const seedRole: UserRole = sa ? 'admin' : 'user';
  const { rows } = await pool.query<UpsertResult>(
    `INSERT INTO users (community_id, telegram_id, username, first_name, last_name, status, role, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (community_id, telegram_id) DO UPDATE
       SET username   = COALESCE(EXCLUDED.username, users.username),
           first_name = COALESCE(EXCLUDED.first_name, users.first_name),
           last_name  = COALESCE(EXCLUDED.last_name, users.last_name),
           status     = CASE WHEN $8 THEN 'approved' ELSE users.status END,
           role       = CASE WHEN $8 THEN 'admin'    ELSE users.role   END,
           last_seen_at = now(),
           updated_at = now()
     RETURNING id, status, role, (xmax = 0) AS inserted`,
    [communityId, tg.id, tg.username ?? null, tg.first_name ?? null, tg.last_name ?? null, seedStatus, seedRole, sa],
  );
  return rows[0]!;
}
