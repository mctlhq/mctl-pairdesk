import type { NextFunction, Request, Response } from 'express';
import { config, isSuperAdmin } from '../config.js';
import { pool } from '../db/pool.js';
import { getDefaultCommunityId } from '../services/community.js';
import { verifyInitData } from '../telegram/initData.js';

export type UserStatus = 'pending' | 'approved' | 'rejected' | 'blocked';
export type UserRole = 'user' | 'trusted_user' | 'moderator' | 'admin';

const ROLE_RANK: Record<UserRole, number> = {
  user: 0,
  trusted_user: 1,
  moderator: 2,
  admin: 3,
};

export interface AuthContext {
  userId: number; // internal users.id
  communityId: number;
  telegramId: number;
  username: string | null;
  status: UserStatus;
  role: UserRole;
  superAdmin: boolean;
}

const CTX = Symbol('authCtx');

export function getCtx(req: Request): AuthContext {
  const ctx = (req as unknown as Record<symbol, AuthContext>)[CTX];
  if (!ctx) throw new Error('auth context missing — route not behind requireAuth');
  return ctx;
}

interface ResolvedUser {
  id: number;
  status: UserStatus;
  role: UserRole;
}

/**
 * Upsert the Telegram user in the default community and return their id + gate
 * state. Super-admins (env allowlist) are force-approved with the admin role so
 * the first operator can always get in; everyone else lands as 'pending' until an
 * admin approves. Existing status/role are otherwise preserved across logins.
 */
async function resolveUser(
  communityId: number,
  telegramId: number,
  username: string | null,
  firstName: string | null,
  lastName: string | null,
): Promise<ResolvedUser> {
  const sa = isSuperAdmin(telegramId);
  const seedStatus: UserStatus = sa ? 'approved' : 'pending';
  const seedRole: UserRole = sa ? 'admin' : 'user';
  const { rows } = await pool.query<ResolvedUser>(
    `INSERT INTO users (community_id, telegram_id, username, first_name, last_name, status, role, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (community_id, telegram_id) DO UPDATE
       SET username   = COALESCE(EXCLUDED.username, users.username),
           first_name = COALESCE(EXCLUDED.first_name, users.first_name),
           last_name  = COALESCE(EXCLUDED.last_name, users.last_name),
           -- super-admins are kept approved/admin; others keep their stored gate state
           status     = CASE WHEN $8 THEN 'approved' ELSE users.status END,
           role       = CASE WHEN $8 THEN 'admin'    ELSE users.role   END,
           last_seen_at = now(),
           updated_at = now()
     RETURNING id, status, role`,
    [communityId, telegramId, username, firstName, lastName, seedStatus, seedRole, sa],
  );
  return rows[0]!;
}

/**
 * Authenticate from the `X-Telegram-Init-Data` header (the Mini App initData
 * string). In dev, AUTH_DEV_BYPASS allows an `X-Debug-User-Id` header. The user
 * row is upserted; downstream gates read status/role from the attached context.
 */
export function requireAuth() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let telegramId: number | null = null;
    let username: string | null = null;
    let firstName: string | null = null;
    let lastName: string | null = null;

    if (config.authDevBypass && req.header('x-debug-user-id')) {
      telegramId = Number.parseInt(req.header('x-debug-user-id') ?? '', 10);
      username = req.header('x-debug-username') ?? null;
    } else {
      const verified = verifyInitData(req.header('x-telegram-init-data') ?? '');
      if (verified) {
        telegramId = verified.user.id;
        username = verified.user.username ?? null;
        firstName = verified.user.first_name ?? null;
        lastName = verified.user.last_name ?? null;
      }
    }

    if (!telegramId || !Number.isFinite(telegramId)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    try {
      const communityId = await getDefaultCommunityId();
      const u = await resolveUser(communityId, telegramId, username, firstName, lastName);
      (req as unknown as Record<symbol, AuthContext>)[CTX] = {
        userId: u.id,
        communityId,
        telegramId,
        username,
        status: u.status,
        role: u.role,
        superAdmin: isSuperAdmin(telegramId),
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Gate a route on the caller being an approved member. Pending/rejected/blocked
 * users get 403 with their status so the client can show the right screen.
 */
export function requireApproved() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ctx = getCtx(req);
    if (ctx.status !== 'approved') {
      res.status(403).json({ error: 'not approved', status: ctx.status });
      return;
    }
    next();
  };
}

/** Gate on minimum role rank. Super-admins always pass. */
export function requireRole(min: UserRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ctx = getCtx(req);
    if (!ctx.superAdmin && ROLE_RANK[ctx.role] < ROLE_RANK[min]) {
      res.status(403).json({ error: `${min} role required` });
      return;
    }
    next();
  };
}
