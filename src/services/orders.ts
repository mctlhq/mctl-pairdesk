import { type Asset, config, isAsset } from '../config.js';
import { pool, type PoolClient, withTransaction } from '../db/pool.js';
import { AppError } from '../middleware/errors.js';
import type { AuthContext } from '../middleware/auth.js';
import { audit } from './audit.js';
import { deltaPercent, getReferenceRate } from './rates.js';
import {
  type GiveOptionRow,
  type OrderRow,
  type PublicCounterparty,
  type RateSnapshotRow,
  serializeOrder,
} from './serializers.js';

const PAYMENT_METHODS = new Set(['bank_transfer', 'cash', 'TRC20', 'ERC20', 'TON', 'other']);

export interface GiveOptionInput {
  asset: string;
  max_rate?: number | string | null;
  payment_methods?: string[];
}

export interface CreateOrderInput {
  want_asset: string;
  want_amount: number | string;
  give_options: GiveOptionInput[];
  location_country?: string | null;
  location_city?: string | null;
  comment?: string | null;
  expires_in_seconds?: number | null;
}

/** Validate + coerce a positive money/rate value, preserving precision as a string. */
function parsePositiveNumeric(v: unknown, field: string): string {
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
  if (!/^\d+(\.\d+)?$/.test(s) || Number.parseFloat(s) <= 0) {
    throw new AppError(400, `${field} must be a positive number`);
  }
  return s;
}

function validatePaymentMethods(methods: unknown, field: string): string[] {
  if (methods == null) return [];
  if (!Array.isArray(methods)) throw new AppError(400, `${field} must be an array`);
  const out: string[] = [];
  for (const m of methods) {
    if (typeof m !== 'string' || !PAYMENT_METHODS.has(m)) {
      throw new AppError(400, `unsupported payment method: ${String(m)}`);
    }
    out.push(m);
  }
  return out;
}

interface NormalizedOption {
  asset: Asset;
  maxRate: string | null;
  paymentMethods: string[];
}

function normalizeInput(input: CreateOrderInput): {
  wantAsset: Asset;
  wantAmount: string;
  options: NormalizedOption[];
  locationCountry: string | null;
  locationCity: string | null;
  comment: string | null;
  expiresInSeconds: number;
} {
  if (!isAsset(input.want_asset)) throw new AppError(400, 'unsupported want_asset');
  const wantAmount = parsePositiveNumeric(input.want_amount, 'want_amount');

  if (!Array.isArray(input.give_options) || input.give_options.length === 0) {
    throw new AppError(400, 'at least one give option is required');
  }
  const seen = new Set<string>();
  const options: NormalizedOption[] = [];
  for (const o of input.give_options) {
    if (!isAsset(o.asset)) throw new AppError(400, `unsupported give asset: ${String(o.asset)}`);
    if (o.asset === input.want_asset) throw new AppError(400, 'a give option cannot equal want_asset');
    if (seen.has(o.asset)) throw new AppError(400, `duplicate give option: ${o.asset}`);
    seen.add(o.asset);
    options.push({
      asset: o.asset,
      maxRate: o.max_rate == null ? null : parsePositiveNumeric(o.max_rate, 'max_rate'),
      paymentMethods: validatePaymentMethods(o.payment_methods, 'payment_methods'),
    });
  }

  const ttl = input.expires_in_seconds ?? config.orderTtlSeconds;
  if (!Number.isFinite(ttl) || ttl < 300 || ttl > 30 * 86_400) {
    throw new AppError(400, 'expires_in_seconds out of range (300s–30d)');
  }

  return {
    wantAsset: input.want_asset,
    wantAmount,
    options,
    locationCountry: (input.location_country ?? null) || null,
    locationCity: (input.location_city ?? null) || null,
    comment: (input.comment ?? null) || null,
    expiresInSeconds: ttl,
  };
}

/**
 * Create an active order with its give options, then take a per-option market
 * reference snapshot (best-effort — a missing rate just omits the warning).
 */
export async function createOrder(
  ctx: AuthContext,
  input: CreateOrderInput,
): Promise<Record<string, unknown>> {
  const n = normalizeInput(input);

  const { orderId, optionIds } = await withTransaction(async (client) => {
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO orders
         (community_id, created_by_user_id, want_asset, want_amount,
          location_country, location_city, comment, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', now() + ($8 || ' seconds')::interval)
       RETURNING id`,
      [
        ctx.communityId,
        ctx.userId,
        n.wantAsset,
        n.wantAmount,
        n.locationCountry,
        n.locationCity,
        n.comment,
        String(n.expiresInSeconds),
      ],
    );
    const oid = rows[0]!.id;
    const ids: Array<{ optionId: number; opt: NormalizedOption }> = [];
    for (const opt of n.options) {
      const r = await client.query<{ id: number }>(
        `INSERT INTO order_give_options (order_id, asset, max_rate, payment_methods)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [oid, opt.asset, opt.maxRate, opt.paymentMethods],
      );
      ids.push({ optionId: r.rows[0]!.id, opt });
    }
    await audit(
      {
        communityId: ctx.communityId,
        actorUserId: ctx.userId,
        action: 'order.created',
        targetType: 'order',
        targetId: oid,
        meta: { want_asset: n.wantAsset, want_amount: n.wantAmount },
      },
      client,
    );
    return { orderId: oid, optionIds: ids };
  });

  // Reference snapshots run outside the create transaction so a slow/absent rate
  // source never blocks or rolls back order creation.
  for (const { optionId, opt } of optionIds) {
    const ref = await getReferenceRate(n.wantAsset, opt.asset);
    if (!ref) continue;
    const delta = opt.maxRate ? deltaPercent(Number.parseFloat(opt.maxRate), ref.rate) : null;
    await pool.query(
      `INSERT INTO reference_rate_snapshots
         (order_id, order_give_option_id, base_asset, quote_asset, rate, source, rate_timestamp, delta_percent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [orderId, optionId, ref.baseAsset, ref.quoteAsset, ref.rate, ref.source, ref.timestamp, delta],
    );
  }

  return (await loadOrderDetail(ctx.communityId, orderId))!;
}

export interface OrderFilters {
  want_asset?: string;
  give_asset?: string;
  location_city?: string;
  limit?: number;
}

/** Public order book: active, non-deleted orders, newest first. */
export async function listOrders(
  communityId: number,
  filters: OrderFilters,
): Promise<Record<string, unknown>[]> {
  const where: string[] = [`o.community_id = $1`, `o.status = 'active'`, `o.deleted_at IS NULL`];
  const params: unknown[] = [communityId];

  if (filters.want_asset && isAsset(filters.want_asset)) {
    params.push(filters.want_asset);
    where.push(`o.want_asset = $${params.length}`);
  }
  if (filters.location_city) {
    params.push(filters.location_city);
    where.push(`o.location_city ILIKE $${params.length}`);
  }
  if (filters.give_asset && isAsset(filters.give_asset)) {
    params.push(filters.give_asset);
    where.push(
      `EXISTS (SELECT 1 FROM order_give_options g WHERE g.order_id = o.id AND g.asset = $${params.length})`,
    );
  }
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
  params.push(limit);

  const { rows: orders } = await pool.query<OrderRow>(
    `SELECT o.* FROM orders o
      WHERE ${where.join(' AND ')}
      ORDER BY o.created_at DESC
      LIMIT $${params.length}`,
    params,
  );
  if (orders.length === 0) return [];
  return assembleOrders(orders);
}

/** Full detail for a single order (any status), or null if not found / deleted. */
export async function loadOrderDetail(
  communityId: number,
  orderId: number,
): Promise<Record<string, unknown> | null> {
  const { rows } = await pool.query<OrderRow>(
    `SELECT * FROM orders WHERE id = $1 AND community_id = $2 AND deleted_at IS NULL`,
    [orderId, communityId],
  );
  if (rows.length === 0) return null;
  const [serialized] = await assembleOrders(rows, true);
  return serialized ?? null;
}

/** Batch-load give options, makers and (optionally) rate snapshots for orders. */
async function assembleOrders(
  orders: OrderRow[],
  withSnapshots = false,
): Promise<Record<string, unknown>[]> {
  const ids = orders.map((o) => o.id);
  const makerIds = [...new Set(orders.map((o) => o.created_by_user_id))];

  const { rows: options } = await pool.query<GiveOptionRow & { order_id: number }>(
    `SELECT id, order_id, asset, max_rate, payment_methods
       FROM order_give_options WHERE order_id = ANY($1)`,
    [ids],
  );
  const { rows: makers } = await pool.query<PublicCounterparty>(
    `SELECT u.id AS user_id, u.username, p.display_name, p.rating_score, p.completed_deals_count
       FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = ANY($1)`,
    [makerIds],
  );
  let snapshots: (RateSnapshotRow & { order_id: number })[] = [];
  if (withSnapshots) {
    const { rows } = await pool.query<RateSnapshotRow & { order_id: number }>(
      `SELECT DISTINCT ON (order_give_option_id)
              order_id, order_give_option_id, base_asset, quote_asset, rate, source, delta_percent
         FROM reference_rate_snapshots
        WHERE order_id = ANY($1)
        ORDER BY order_give_option_id, created_at DESC`,
      [ids],
    );
    snapshots = rows;
  }

  const optByOrder = new Map<number, GiveOptionRow[]>();
  for (const o of options) {
    const arr = optByOrder.get(o.order_id) ?? [];
    arr.push({ id: o.id, asset: o.asset, max_rate: o.max_rate, payment_methods: o.payment_methods });
    optByOrder.set(o.order_id, arr);
  }
  const snapByOrder = new Map<number, RateSnapshotRow[]>();
  for (const s of snapshots) {
    const arr = snapByOrder.get(s.order_id) ?? [];
    arr.push(s);
    snapByOrder.set(s.order_id, arr);
  }
  const makerById = new Map(makers.map((m) => [m.user_id, m]));

  return orders.map((o) =>
    serializeOrder(
      o,
      optByOrder.get(o.id) ?? [],
      makerById.get(o.created_by_user_id) ?? null,
      snapByOrder.get(o.id) ?? [],
    ),
  );
}

/** Cancel an order the caller owns (only while it is still cancellable). */
export async function cancelOrder(ctx: AuthContext, orderId: number): Promise<void> {
  await withTransaction(async (client) => {
    const { rows } = await client.query<{ created_by_user_id: number; status: string }>(
      `SELECT created_by_user_id, status FROM orders
        WHERE id = $1 AND community_id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [orderId, ctx.communityId],
    );
    const order = rows[0];
    if (!order) throw new AppError(404, 'order not found');
    if (order.created_by_user_id !== ctx.userId && !ctx.superAdmin) {
      throw new AppError(403, 'not your order');
    }
    if (!['active', 'draft', 'reserved'].includes(order.status)) {
      throw new AppError(409, `cannot cancel a ${order.status} order`);
    }
    await client.query(
      `UPDATE orders SET status = 'cancelled', cancelled_at = now(), updated_at = now() WHERE id = $1`,
      [orderId],
    );
    await client.query(
      `UPDATE deals SET status = 'cancelled', cancelled_at = now(), updated_at = now()
        WHERE order_id = $1 AND status IN ('requested','accepted')`,
      [orderId],
    );
    await audit(
      { communityId: ctx.communityId, actorUserId: ctx.userId, action: 'order.cancelled', targetType: 'order', targetId: orderId },
      client,
    );
  });
}

/**
 * Expire active orders past their expires_at. Idempotent and safe on every
 * replica; returns the number expired.
 */
export async function expireStaleOrders(): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE orders SET status = 'expired', updated_at = now()
      WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < now()`,
  );
  return rowCount ?? 0;
}
