import { Router } from 'express';
import { isAsset } from '../config.js';
import { pool } from '../db/pool.js';
import { getCtx, requireApproved } from '../middleware/auth.js';

export const subscriptionsRouter = Router();
subscriptionsRouter.use(requireApproved());

function numOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = typeof v === 'number' ? String(v) : String(v).trim();
  return /^\d+(\.\d+)?$/.test(s) ? s : null;
}

function assetList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((a): a is string => typeof a === 'string' && isAsset(a)))];
}

subscriptionsRouter.get('/subscriptions', async (req, res, next) => {
  try {
    const ctx = getCtx(req);
    const { rows } = await pool.query(
      `SELECT * FROM subscriptions WHERE user_id = $1 AND community_id = $2 ORDER BY created_at DESC`,
      [ctx.userId, ctx.communityId],
    );
    res.json({ subscriptions: rows });
  } catch (err) {
    next(err);
  }
});

subscriptionsRouter.post('/subscriptions', async (req, res, next) => {
  try {
    const ctx = getCtx(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!isAsset(b.want_asset)) return res.status(400).json({ error: 'unsupported want_asset' });
    const { rows } = await pool.query(
      `INSERT INTO subscriptions
         (community_id, user_id, want_asset, give_assets, min_amount, max_amount, max_rate,
          location_country, location_city, payment_methods)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        ctx.communityId,
        ctx.userId,
        b.want_asset,
        assetList(b.give_assets),
        numOrNull(b.min_amount),
        numOrNull(b.max_amount),
        numOrNull(b.max_rate),
        typeof b.location_country === 'string' ? b.location_country.slice(0, 120) : null,
        typeof b.location_city === 'string' ? b.location_city.slice(0, 120) : null,
        Array.isArray(b.payment_methods) ? b.payment_methods.filter((m): m is string => typeof m === 'string').slice(0, 12) : [],
      ],
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    return next(err);
  }
});

subscriptionsRouter.patch('/subscriptions/:id', async (req, res, next) => {
  try {
    const ctx = getCtx(req);
    const id = Number.parseInt(req.params.id ?? '', 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad subscription id' });
    const b = (req.body ?? {}) as Record<string, unknown>;
    const isActive = typeof b.is_active === 'boolean' ? b.is_active : null;
    const { rowCount } = await pool.query(
      `UPDATE subscriptions
          SET is_active = COALESCE($3, is_active),
              max_rate  = COALESCE($4, max_rate),
              updated_at = now()
        WHERE id = $1 AND user_id = $2`,
      [id, ctx.userId, isActive, numOrNull(b.max_rate)],
    );
    if (!rowCount) return res.status(404).json({ error: 'subscription not found' });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

subscriptionsRouter.delete('/subscriptions/:id', async (req, res, next) => {
  try {
    const ctx = getCtx(req);
    const id = Number.parseInt(req.params.id ?? '', 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad subscription id' });
    const { rowCount } = await pool.query(`DELETE FROM subscriptions WHERE id = $1 AND user_id = $2`, [id, ctx.userId]);
    if (!rowCount) return res.status(404).json({ error: 'subscription not found' });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});
