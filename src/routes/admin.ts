import { Router } from 'express';
import { pool } from '../db/pool.js';
import { getCtx, requireApproved, requireRole } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { notify } from '../telegram/bot.js';

export const adminRouter = Router();
adminRouter.use(requireApproved());
adminRouter.use(requireRole('moderator'));

adminRouter.get('/users/pending', async (req, res, next) => {
  try {
    const ctx = getCtx(req);
    const { rows } = await pool.query(
      `SELECT id, telegram_id, username, first_name, last_name, status, role, created_at
         FROM users WHERE community_id = $1 AND status = 'pending' ORDER BY created_at ASC`,
      [ctx.communityId],
    );
    res.json({ users: rows });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/users', async (req, res, next) => {
  try {
    const ctx = getCtx(req);
    const { rows } = await pool.query(
      `SELECT id, telegram_id, username, status, role, created_at, last_seen_at
         FROM users WHERE community_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [ctx.communityId],
    );
    res.json({ users: rows });
  } catch (err) {
    next(err);
  }
});

/** Transition a target user's status and audit it; optionally notify them. */
async function setStatus(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction, status: string, action: string, notifyText?: string): Promise<void> {
  try {
    const ctx = getCtx(req);
    const id = Number.parseInt(req.params.id ?? '', 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'bad user id' });
      return;
    }
    const { rows } = await pool.query<{ telegram_id: number }>(
      `UPDATE users SET status = $3, updated_at = now()
        WHERE id = $1 AND community_id = $2 RETURNING telegram_id`,
      [id, ctx.communityId, status],
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'user not found' });
      return;
    }
    await audit({ communityId: ctx.communityId, actorUserId: ctx.userId, action, targetType: 'user', targetId: id });
    if (notifyText && rows[0]!.telegram_id) void notify(rows[0]!.telegram_id, notifyText);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

adminRouter.post('/users/:id/approve', (req, res, next) =>
  setStatus(req, res, next, 'approved', 'admin.user_approved', 'You have been approved for PairDesk. Open the app to start.'),
);
adminRouter.post('/users/:id/reject', (req, res, next) =>
  setStatus(req, res, next, 'rejected', 'admin.user_rejected'),
);
adminRouter.post('/users/:id/block', (req, res, next) =>
  setStatus(req, res, next, 'blocked', 'admin.user_blocked'),
);
adminRouter.post('/users/:id/unblock', (req, res, next) =>
  setStatus(req, res, next, 'approved', 'admin.user_unblocked'),
);

adminRouter.get('/orders', async (req, res, next) => {
  try {
    const ctx = getCtx(req);
    const { rows } = await pool.query(
      `SELECT id, created_by_user_id, want_asset, want_amount, status, location_city, created_at
         FROM orders WHERE community_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 200`,
      [ctx.communityId],
    );
    res.json({ orders: rows });
  } catch (err) {
    next(err);
  }
});

// Soft-remove an order (moderation), cancelling any open deals on it.
adminRouter.post('/orders/:id/remove', async (req, res, next) => {
  try {
    const ctx = getCtx(req);
    const id = Number.parseInt(req.params.id ?? '', 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad order id' });
    const { rowCount } = await pool.query(
      `UPDATE orders SET deleted_at = now(), status = 'cancelled', cancelled_at = now(), updated_at = now()
        WHERE id = $1 AND community_id = $2 AND deleted_at IS NULL`,
      [id, ctx.communityId],
    );
    if (!rowCount) return res.status(404).json({ error: 'order not found' });
    await pool.query(
      `UPDATE deals SET status = 'cancelled', cancelled_at = now(), updated_at = now()
        WHERE order_id = $1 AND status IN ('requested','accepted')`,
      [id],
    );
    await audit({ communityId: ctx.communityId, actorUserId: ctx.userId, action: 'admin.order_removed', targetType: 'order', targetId: id });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// Flag an order as suspicious (audit-only marker for the MVP).
adminRouter.post('/orders/:id/flag', async (req, res, next) => {
  try {
    const ctx = getCtx(req);
    const id = Number.parseInt(req.params.id ?? '', 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad order id' });
    const reason = typeof (req.body ?? {}).reason === 'string' ? (req.body as { reason: string }).reason.slice(0, 500) : null;
    await audit({ communityId: ctx.communityId, actorUserId: ctx.userId, action: 'admin.order_flagged', targetType: 'order', targetId: id, meta: { reason } });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});
