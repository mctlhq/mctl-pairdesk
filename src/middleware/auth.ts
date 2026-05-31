import type { NextFunction, Request, Response } from 'express';
import { config, isSuperAdmin } from '../config.js';
import { getDefaultCommunityId } from '../services/community.js';
import { notifyAdminsOfNewUser } from '../services/moderation.js';
import { upsertTelegramUser } from '../services/users.js';
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
      const u = await upsertTelegramUser(communityId, {
        id: telegramId,
        username,
        first_name: firstName,
        last_name: lastName,
      });
      // A brand-new pending member → let the moderators know (once, best-effort).
      if (u.inserted && u.status === 'pending') {
        void notifyAdminsOfNewUser(communityId, u.id, username ? `@${username}` : `id ${telegramId}`);
      }
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
