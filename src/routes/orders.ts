import { Router } from 'express';
import { getCtx, requireApproved } from '../middleware/auth.js';
import { AppError, sendAppError } from '../middleware/errors.js';
import { cancelOrder, createOrder, listMyOrders, listOrders, loadOrderDetail } from '../services/orders.js';
import { listOrderDeals, respondToOrder } from '../services/deals.js';

export const ordersRouter = Router();
ordersRouter.use(requireApproved());

// In-memory rate limit: max 10 orders per 1-hour sliding window per user.
// Single-process (per-replica) is sufficient for a closed community at this scale.
const orderCreations = new Map<number, { count: number; windowStart: number }>();
const MAX_ORDERS_PER_HOUR = 10;
const WINDOW_MS = 3_600_000;

function checkOrderRate(userId: number): void {
  const now = Date.now();
  const entry = orderCreations.get(userId);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    orderCreations.set(userId, { count: 1, windowStart: now });
    return;
  }
  if (entry.count >= MAX_ORDERS_PER_HOUR) {
    throw new AppError(429, 'too many orders — try again in an hour');
  }
  entry.count++;
}

// Public order book (within the community).
ordersRouter.get('/orders', async (req, res, next) => {
  try {
    const ctx = getCtx(req);
    const beforeRaw = req.query.before ? Number.parseInt(req.query.before as string, 10) : undefined;
    const result = await listOrders(ctx.communityId, {
      want_asset: req.query.want_asset as string | undefined,
      give_asset: req.query.give_asset as string | undefined,
      location_city: req.query.location_city as string | undefined,
      limit: req.query.limit ? Number.parseInt(req.query.limit as string, 10) : undefined,
      before_id: Number.isFinite(beforeRaw) ? beforeRaw : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

ordersRouter.post('/orders', async (req, res, next) => {
  try {
    const ctx = getCtx(req);
    checkOrderRate(ctx.userId);
    const order = await createOrder(ctx, req.body ?? {});
    res.status(201).json(order);
  } catch (err) {
    sendAppError(res, err, next);
  }
});

// Registered before /orders/:id so "mine" is not parsed as an order id.
ordersRouter.get('/orders/mine', async (req, res, next) => {
  try {
    const ctx = getCtx(req);
    res.json({ orders: await listMyOrders(ctx.communityId, ctx.userId) });
  } catch (err) {
    next(err);
  }
});

ordersRouter.get('/orders/:id', async (req, res, next) => {
  try {
    const ctx = getCtx(req);
    const id = Number.parseInt(req.params.id ?? '', 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad order id' });
    const order = await loadOrderDetail(ctx.communityId, id);
    if (!order) return res.status(404).json({ error: 'order not found' });
    return res.json(order);
  } catch (err) {
    return next(err);
  }
});

// Deals on this order, scoped server-side to what the caller may see.
ordersRouter.get('/orders/:id/deals', async (req, res, next) => {
  try {
    const ctx = getCtx(req);
    const id = Number.parseInt(req.params.id ?? '', 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad order id' });
    return res.json({ deals: await listOrderDeals(ctx, id) });
  } catch (err) {
    return sendAppError(res, err, next);
  }
});

ordersRouter.post('/orders/:id/cancel', async (req, res, next) => {
  try {
    const ctx = getCtx(req);
    const id = Number.parseInt(req.params.id ?? '', 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad order id' });
    await cancelOrder(ctx, id);
    return res.json({ ok: true });
  } catch (err) {
    return sendAppError(res, err, next);
  }
});

// Express interest → creates a `requested` deal (order stays active).
ordersRouter.post('/orders/:id/respond', async (req, res, next) => {
  try {
    const ctx = getCtx(req);
    const id = Number.parseInt(req.params.id ?? '', 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad order id' });
    const result = await respondToOrder(ctx, id);
    return res.status(201).json(result);
  } catch (err) {
    return sendAppError(res, err, next);
  }
});
