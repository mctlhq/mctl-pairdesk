// Integration test for the TTL sweeper. Runs against the COMPILED build (dist/) so the
// `.js` import graph resolves, and against the throwaway Postgres (scripts/test-db.sh).
// It exercises the REAL `expireStaleOrders()` — the same function the server runs every
// 60s — against a backdated order, instead of waiting out a 300s+ TTL. No product change,
// no wait. Run via: npm run test:expiry
import test from 'node:test';
import assert from 'node:assert/strict';

// config.ts reads process.env at import time — set defaults BEFORE importing anything
// that pulls it in, then use dynamic import so evaluation order is guaranteed.
process.env.DATABASE_URL ??= 'postgres://pairdesk:pairdesk@localhost:5433/pairdesk_test';
process.env.DATABASE_SSL ??= 'false';
process.env.TELEGRAM_BOT_TOKEN ??= 'test:HARNESS';
process.env.SUPER_ADMIN_TELEGRAM_IDS ??= '700100100';
process.env.COMMUNITY_SLUG ??= 'default';
process.env.COMMUNITY_NAME ??= 'E2E Test Community';

const { pool } = await import('../../dist/db/pool.js');
const { migrate } = await import('../../dist/db/migrate.js');
const { getDefaultCommunityId } = await import('../../dist/services/community.js');
const { expireStaleOrders } = await import('../../dist/services/orders.js');

test('sweeper flips a past-due active order to expired (and leaves fresh ones alone)', async (t) => {
  await migrate();
  const communityId = await getDefaultCommunityId();

  const { rows: u } = await pool.query(
    `INSERT INTO users (community_id, telegram_id, username, status, role)
     VALUES ($1, $2, 'expiry_probe', 'approved', 'user')
     ON CONFLICT (community_id, telegram_id) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [communityId, 909090909],
  );
  const userId = u[0].id;

  // One already-lapsed active order, one still-fresh active order.
  const { rows: stale } = await pool.query(
    `INSERT INTO orders (community_id, created_by_user_id, want_asset, want_amount, status, expires_at)
     VALUES ($1, $2, 'EUR', 100, 'active', now() - interval '1 hour') RETURNING id`,
    [communityId, userId],
  );
  const { rows: fresh } = await pool.query(
    `INSERT INTO orders (community_id, created_by_user_id, want_asset, want_amount, status, expires_at)
     VALUES ($1, $2, 'EUR', 200, 'active', now() + interval '1 hour') RETURNING id`,
    [communityId, userId],
  );
  const staleId = stale[0].id;
  const freshId = fresh[0].id;

  t.after(async () => {
    await pool.query('DELETE FROM orders WHERE id = ANY($1)', [[staleId, freshId]]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  });

  const expired = await expireStaleOrders();
  assert.ok(expired >= 1, `expected >=1 expired, got ${expired}`);

  const { rows: after } = await pool.query('SELECT id, status FROM orders WHERE id = ANY($1)', [[staleId, freshId]]);
  const byId = Object.fromEntries(after.map((r) => [String(r.id), r.status]));
  assert.equal(byId[String(staleId)], 'expired', 'past-due order should be expired');
  assert.equal(byId[String(freshId)], 'active', 'fresh order should stay active');
});
