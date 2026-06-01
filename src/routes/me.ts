import { Router } from 'express';
import { pool } from '../db/pool.js';
import { getCtx } from '../middleware/auth.js';

export const meRouter = Router();

// Current user + gate state + profile. Reachable by PENDING users (they need to
// see their status and accept the disclaimer before being approved).
meRouter.get('/me', async (req, res, next) => {
  try {
    const ctx = getCtx(req);
    const { rows } = await pool.query<{
      disclaimer_accepted_at: string | null;
      phone: string | null;
      contact: string | null;
      display_name: string | null;
      city: string | null;
      country: string | null;
      preferred_payment_methods: string[] | null;
      rating_score: string | null;
      completed_deals_count: number | null;
    }>(
      `SELECT u.disclaimer_accepted_at, u.phone, u.contact,
              p.display_name, p.city, p.country, p.preferred_payment_methods,
              p.rating_score, p.completed_deals_count
         FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
        WHERE u.id = $1`,
      [ctx.userId],
    );
    const r = rows[0];
    res.json({
      id: ctx.userId,
      telegram_id: ctx.telegramId,
      username: ctx.username,
      status: ctx.status,
      role: ctx.role,
      super_admin: ctx.superAdmin,
      disclaimer_accepted: r?.disclaimer_accepted_at != null,
      profile: {
        display_name: r?.display_name ?? null,
        city: r?.city ?? null,
        country: r?.country ?? null,
        preferred_payment_methods: r?.preferred_payment_methods ?? [],
        phone: r?.phone ?? null,
        contact: r?.contact ?? null,
        rating_score: r?.rating_score ?? '0',
        completed_deals_count: r?.completed_deals_count ?? 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Community-level stats — approved member count + open order count.
// Scoped to the caller's community; response is cached in-process for 5 min.
let statsCache: { members: number; orders_open: number; cachedAt: number } | null = null;
const STATS_TTL_MS = 5 * 60_000;

meRouter.get('/community/stats', async (req, res, next) => {
  try {
    const ctx = getCtx(req);
    if (statsCache && Date.now() - statsCache.cachedAt < STATS_TTL_MS) {
      return res.json(statsCache);
    }
    const { rows } = await pool.query<{ members: string; orders_open: string }>(
      `SELECT
         (SELECT count(*) FROM users  WHERE community_id = $1 AND status = 'approved') AS members,
         (SELECT count(*) FROM orders WHERE community_id = $1 AND status = 'active' AND deleted_at IS NULL) AS orders_open`,
      [ctx.communityId],
    );
    const r = rows[0]!;
    statsCache = { members: Number(r.members), orders_open: Number(r.orders_open), cachedAt: Date.now() };
    return res.json(statsCache);
  } catch (err) {
    return next(err);
  }
});

// Record disclaimer acceptance (req #6 of the UI gate). Idempotent.
meRouter.post('/me/accept-disclaimer', async (req, res, next) => {
  try {
    const ctx = getCtx(req);
    await pool.query(
      `UPDATE users SET disclaimer_accepted_at = COALESCE(disclaimer_accepted_at, now()), updated_at = now()
        WHERE id = $1`,
      [ctx.userId],
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Update own profile. Sensitive fields (phone, contact) live on users and are
// only ever exposed to a matched counterparty by the deal serializer.
meRouter.patch('/me', async (req, res, next) => {
  try {
    const ctx = getCtx(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const display = typeof b.display_name === 'string' ? b.display_name.slice(0, 120) : null;
    const city = typeof b.city === 'string' ? b.city.slice(0, 120) : null;
    const country = typeof b.country === 'string' ? b.country.slice(0, 120) : null;
    const methods = Array.isArray(b.preferred_payment_methods)
      ? b.preferred_payment_methods.filter((m): m is string => typeof m === 'string').slice(0, 12)
      : [];
    const phone = typeof b.phone === 'string' ? b.phone.slice(0, 64) : null;
    const contact = typeof b.contact === 'string' ? b.contact.slice(0, 500) : null;

    await pool.query(
      `UPDATE users SET phone = $2, contact = $3, updated_at = now() WHERE id = $1`,
      [ctx.userId, phone, contact],
    );
    await pool.query(
      `INSERT INTO user_profiles (user_id, display_name, city, country, preferred_payment_methods)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             city = EXCLUDED.city,
             country = EXCLUDED.country,
             preferred_payment_methods = EXCLUDED.preferred_payment_methods,
             updated_at = now()`,
      [ctx.userId, display, city, country, methods],
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
