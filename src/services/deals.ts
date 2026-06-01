import { pool, withTransaction } from '../db/pool.js';
import type { AuthContext } from '../middleware/auth.js';
import { AppError } from '../middleware/errors.js';
import { audit } from './audit.js';
import { type InlineButton, notify, openAppButton } from '../telegram/bot.js';

interface OrderLockRow {
  id: number;
  created_by_user_id: number;
  status: string;
  want_asset: string;
  want_amount: string;
}

/** Postgres unique-violation SQLSTATE. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

/**
 * Respond to an order: create a `requested` deal. The order stays `active`, so
 * multiple responders can queue; the binding lock happens later, on accept. A
 * responder may hold only one open deal per order (DB unique index backstop).
 */
export async function respondToOrder(ctx: AuthContext, orderId: number): Promise<{ deal_id: number }> {
  try {
    return await withTransaction(async (client) => {
      const { rows } = await client.query<OrderLockRow>(
        `SELECT id, created_by_user_id, status, want_asset, want_amount FROM orders
          WHERE id = $1 AND community_id = $2 AND deleted_at IS NULL`,
        [orderId, ctx.communityId],
      );
      const order = rows[0];
      if (!order) throw new AppError(404, 'order not found');
      if (order.status !== 'active') throw new AppError(409, `order is ${order.status}`);
      if (order.created_by_user_id === ctx.userId) throw new AppError(409, 'cannot respond to your own order');

      const ins = await client.query<{ id: number }>(
        `INSERT INTO deals (community_id, order_id, creator_user_id, responder_user_id, status)
         VALUES ($1, $2, $3, $4, 'requested') RETURNING id`,
        [ctx.communityId, orderId, order.created_by_user_id, ctx.userId],
      );
      const dealId = ins.rows[0]!.id;
      await audit(
        { communityId: ctx.communityId, actorUserId: ctx.userId, action: 'deal.requested', targetType: 'deal', targetId: dealId, meta: { order_id: orderId } },
        client,
      );
      void notifyCreatorOfResponse(order.created_by_user_id, orderId, dealId, {
        wantAsset: order.want_asset,
        wantAmount: order.want_amount,
        responderUserId: ctx.userId,
      });
      return { deal_id: dealId };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError(409, 'you already have an open response on this order');
    throw err;
  }
}

/**
 * Accept a responder. THE binding concurrency point: lock the order row
 * (`FOR NO KEY UPDATE` so it doesn't block the deals FK references), verify it is
 * still `active`, flip it to `reserved`, accept the chosen deal and system-reject
 * the siblings — all in one transaction. Two creators/clients racing accept on
 * the same order cannot both win (the order-status check + lock, with the partial
 * unique index `uq_deals_winner` as the DB-level backstop).
 */
export async function acceptDeal(ctx: AuthContext, dealId: number): Promise<void> {
  let siblingUserIds: number[] = [];
  await withTransaction(async (client) => {
    const dealRes = await client.query<{ order_id: number; creator_user_id: number; responder_user_id: number; status: string }>(
      `SELECT order_id, creator_user_id, responder_user_id, status FROM deals
        WHERE id = $1 AND community_id = $2`,
      [dealId, ctx.communityId],
    );
    const deal = dealRes.rows[0];
    if (!deal) throw new AppError(404, 'deal not found');
    if (deal.creator_user_id !== ctx.userId && !ctx.superAdmin) throw new AppError(403, 'only the order creator can accept');
    if (deal.status !== 'requested') throw new AppError(409, `deal is ${deal.status}`);

    const orderRes = await client.query<OrderLockRow>(
      `SELECT id, created_by_user_id, status FROM orders
        WHERE id = $1 AND deleted_at IS NULL FOR NO KEY UPDATE`,
      [deal.order_id],
    );
    const order = orderRes.rows[0];
    if (!order) throw new AppError(404, 'order not found');
    if (order.status !== 'active') throw new AppError(409, `order is ${order.status}, cannot accept`);

    await client.query(
      `UPDATE orders SET status = 'reserved', reserved_by_user_id = $2, reserved_at = now(), updated_at = now()
        WHERE id = $1`,
      [order.id, deal.responder_user_id],
    );
    await client.query(`UPDATE deals SET status = 'accepted', updated_at = now() WHERE id = $1`, [dealId]);
    // Collect sibling responders via RETURNING before they disappear from 'requested'
    const siblings = await client.query<{ responder_user_id: number }>(
      `UPDATE deals SET status = 'rejected', updated_at = now()
        WHERE order_id = $1 AND id <> $2 AND status = 'requested'
        RETURNING responder_user_id`,
      [order.id, dealId],
    );
    siblingUserIds = siblings.rows.map((r) => r.responder_user_id);
    await audit(
      { communityId: ctx.communityId, actorUserId: ctx.userId, action: 'deal.accepted', targetType: 'deal', targetId: dealId, meta: { order_id: order.id } },
      client,
    );
  });
  void notifyDealAccepted(dealId);
  void notifySiblingsRejected(siblingUserIds);
}

/** Creator declines one specific requested deal (without accepting another). */
export async function rejectDeal(ctx: AuthContext, dealId: number): Promise<void> {
  await withTransaction(async (client) => {
    const { rows } = await client.query<{ creator_user_id: number; status: string; order_id: number }>(
      `SELECT creator_user_id, status, order_id FROM deals WHERE id = $1 AND community_id = $2 FOR UPDATE`,
      [dealId, ctx.communityId],
    );
    const deal = rows[0];
    if (!deal) throw new AppError(404, 'deal not found');
    if (deal.creator_user_id !== ctx.userId && !ctx.superAdmin) throw new AppError(403, 'only the order creator can reject');
    if (deal.status !== 'requested') throw new AppError(409, `deal is ${deal.status}`);
    await client.query(`UPDATE deals SET status = 'rejected', updated_at = now() WHERE id = $1`, [dealId]);
    await audit(
      { communityId: ctx.communityId, actorUserId: ctx.userId, action: 'deal.rejected', targetType: 'deal', targetId: dealId, meta: { order_id: deal.order_id } },
      client,
    );
  });
  void notifyDealRejected(dealId);
}

/** Either party marks an accepted deal complete: order→completed, ratings bumped. */
export async function completeDeal(ctx: AuthContext, dealId: number): Promise<void> {
  await withTransaction(async (client) => {
    const { rows } = await client.query<{ order_id: number; creator_user_id: number; responder_user_id: number; status: string }>(
      `SELECT order_id, creator_user_id, responder_user_id, status FROM deals
        WHERE id = $1 AND community_id = $2 FOR UPDATE`,
      [dealId, ctx.communityId],
    );
    const deal = rows[0];
    if (!deal) throw new AppError(404, 'deal not found');
    if (![deal.creator_user_id, deal.responder_user_id].includes(ctx.userId) && !ctx.superAdmin) {
      throw new AppError(403, 'not a party to this deal');
    }
    if (deal.status !== 'accepted') throw new AppError(409, `deal is ${deal.status}`);

    await client.query(`UPDATE deals SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = $1`, [dealId]);
    await client.query(
      `UPDATE orders SET status = 'completed', completed_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'reserved'`,
      [deal.order_id],
    );
    for (const uid of [deal.creator_user_id, deal.responder_user_id]) {
      await client.query(
        `INSERT INTO user_profiles (user_id, completed_deals_count)
         VALUES ($1, 1)
         ON CONFLICT (user_id) DO UPDATE SET completed_deals_count = user_profiles.completed_deals_count + 1, updated_at = now()`,
        [uid],
      );
    }
    await audit(
      { communityId: ctx.communityId, actorUserId: ctx.userId, action: 'deal.completed', targetType: 'deal', targetId: dealId, meta: { order_id: deal.order_id } },
      client,
    );
  });
}

interface DealDetailRow {
  id: number;
  order_id: number;
  creator_user_id: number;
  responder_user_id: number;
  status: string;
  created_at: string;
  completed_at: string | null;
  order_status: string;
  c_username: string | null;
  c_phone: string | null;
  c_contact: string | null;
  c_telegram_id: number;
  r_username: string | null;
  r_phone: string | null;
  r_contact: string | null;
  r_telegram_id: number;
}

/**
 * Deal detail. Contacts are revealed ONLY when all hold (req #6): the caller is
 * the creator or the chosen responder, the deal is accepted/completed, AND the
 * order is reserved/completed. A merely `requested` responder never sees contacts.
 */
export async function getDealDetail(ctx: AuthContext, dealId: number): Promise<Record<string, unknown>> {
  const { rows } = await pool.query<DealDetailRow>(
    `SELECT d.id, d.order_id, d.creator_user_id, d.responder_user_id, d.status, d.created_at, d.completed_at,
            o.status AS order_status,
            cu.username AS c_username, cu.phone AS c_phone, cu.contact AS c_contact, cu.telegram_id AS c_telegram_id,
            ru.username AS r_username, ru.phone AS r_phone, ru.contact AS r_contact, ru.telegram_id AS r_telegram_id
       FROM deals d
       JOIN orders o ON o.id = d.order_id
       JOIN users cu ON cu.id = d.creator_user_id
       JOIN users ru ON ru.id = d.responder_user_id
      WHERE d.id = $1 AND d.community_id = $2`,
    [dealId, ctx.communityId],
  );
  const d = rows[0];
  if (!d) throw new AppError(404, 'deal not found');

  const isParty = ctx.userId === d.creator_user_id || ctx.userId === d.responder_user_id;
  if (!isParty && !ctx.superAdmin) throw new AppError(403, 'not a party to this deal');

  const contactsAllowed =
    isParty &&
    ['accepted', 'completed'].includes(d.status) &&
    ['reserved', 'completed'].includes(d.order_status);

  if (contactsAllowed) {
    // Record that contacts were exposed (req #9). Best-effort, non-blocking.
    void audit({
      communityId: ctx.communityId,
      actorUserId: ctx.userId,
      action: 'deal.contact_revealed',
      targetType: 'deal',
      targetId: dealId,
    });
  }

  const base = {
    id: d.id,
    order_id: d.order_id,
    status: d.status,
    order_status: d.order_status,
    creator_user_id: d.creator_user_id,
    responder_user_id: d.responder_user_id,
    created_at: d.created_at,
    completed_at: d.completed_at,
    contacts_revealed: contactsAllowed,
  };
  if (!contactsAllowed) return base;
  return {
    ...base,
    creator_contact: { telegram_id: d.c_telegram_id, username: d.c_username, phone: d.c_phone, contact: d.c_contact },
    responder_contact: { telegram_id: d.r_telegram_id, username: d.r_username, phone: d.r_phone, contact: d.r_contact },
  };
}

/**
 * Deals on a single order, scoped to what the caller may see: the order creator
 * (or super-admin) sees every response; any other caller sees only their own
 * deal on that order. Avoids shipping the caller's whole deal list to the client
 * just to filter by order, and keeps authorization narrow.
 */
export async function listOrderDeals(ctx: AuthContext, orderId: number): Promise<Record<string, unknown>[]> {
  const ord = await pool.query<{ created_by_user_id: number }>(
    `SELECT created_by_user_id FROM orders WHERE id = $1 AND community_id = $2 AND deleted_at IS NULL`,
    [orderId, ctx.communityId],
  );
  if (ord.rows.length === 0) throw new AppError(404, 'order not found');
  const isMaker = ord.rows[0]!.created_by_user_id === ctx.userId || ctx.superAdmin;

  const { rows } = await pool.query(
    `SELECT d.id, d.order_id, d.status, d.creator_user_id, d.responder_user_id, d.created_at,
            re.username AS responder_username, re.first_name AS responder_name
       FROM deals d
       JOIN users re ON re.id = d.responder_user_id
      WHERE d.community_id = $1 AND d.order_id = $2
        AND ($3 OR d.responder_user_id = $4)
      ORDER BY d.created_at ASC`,
    [ctx.communityId, orderId, isMaker, ctx.userId],
  );
  return rows;
}

/** Deals the caller is involved in (as creator or responder), newest first. */
export async function listMyDeals(ctx: AuthContext): Promise<Record<string, unknown>[]> {
  const { rows } = await pool.query(
    `SELECT d.id, d.order_id, d.status, d.creator_user_id, d.responder_user_id, d.created_at,
            o.want_asset, o.want_amount, o.status AS order_status, o.location_city,
            cr.username AS creator_username, cr.first_name AS creator_name,
            re.username AS responder_username, re.first_name AS responder_name
       FROM deals d
       JOIN orders o  ON o.id = d.order_id
       JOIN users  cr ON cr.id = d.creator_user_id
       JOIN users  re ON re.id = d.responder_user_id
      WHERE d.community_id = $1 AND ($2 IN (d.creator_user_id, d.responder_user_id))
      ORDER BY d.created_at DESC LIMIT 100`,
    [ctx.communityId, ctx.userId],
  );
  return rows;
}

// ---- notifications (best-effort; Stage 2 enriches with deep links) ----

async function notifyCreatorOfResponse(
  creatorUserId: number,
  orderId: number,
  dealId: number,
  info: { wantAsset: string; wantAmount: string; responderUserId: number },
): Promise<void> {
  const tg = await telegramIdOf(creatorUserId);
  if (!tg) return;
  const { rows: ru } = await pool.query<{ username: string | null; first_name: string | null }>(
    `SELECT username, first_name FROM users WHERE id = $1`,
    [info.responderUserId],
  );
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rawName = ru[0]?.username ? `@${ru[0].username}` : (ru[0]?.first_name ?? 'A member');
  const responder = esc(rawName);
  const amount = `${info.wantAmount} ${info.wantAsset}`;
  const text = `${responder} responded to your order: ${amount}\n\nAccepting will share contact details so you can arrange the exchange directly.`;
  const buttons: InlineButton[][] = [
    [
      { text: '✓ Accept', callback_data: `accept_deal:${dealId}` },
      { text: '✗ Reject', callback_data: `reject_deal:${dealId}` },
    ],
  ];
  const open = openAppButton('Open order');
  if (open) buttons.push([open]);
  await notify(tg, text, buttons);
}

async function notifyDealAccepted(dealId: number): Promise<void> {
  const { rows } = await pool.query<{ tg: number }>(
    `SELECT u.telegram_id AS tg FROM deals d JOIN users u ON u.id = d.responder_user_id WHERE d.id = $1`,
    [dealId],
  );
  const tg = rows[0]?.tg;
  if (!tg) return;
  const open = openAppButton('Open deal');
  await notify(tg, `Your response was accepted! Open PairDesk → Deals tab to see the counterparty's contact details and arrange the exchange.`, open ? [[open]] : undefined);
}

async function notifyDealRejected(dealId: number): Promise<void> {
  const { rows } = await pool.query<{ tg: number }>(
    `SELECT u.telegram_id AS tg FROM deals d JOIN users u ON u.id = d.responder_user_id WHERE d.id = $1`,
    [dealId],
  );
  const tg = rows[0]?.tg;
  if (!tg) return;
  await notify(tg, `Your response to the order was not selected this time.`);
}

async function notifySiblingsRejected(userIds: number[]): Promise<void> {
  if (userIds.length === 0) return;
  const { rows } = await pool.query<{ telegram_id: number }>(
    `SELECT telegram_id FROM users WHERE id = ANY($1)`,
    [userIds],
  );
  for (const { telegram_id } of rows) {
    void notify(telegram_id, `Your response to the order was not selected — the maker chose another respondent.`);
  }
}

async function telegramIdOf(userId: number): Promise<number | null> {
  const { rows } = await pool.query<{ telegram_id: number }>(`SELECT telegram_id FROM users WHERE id = $1`, [userId]);
  return rows[0]?.telegram_id ?? null;
}
