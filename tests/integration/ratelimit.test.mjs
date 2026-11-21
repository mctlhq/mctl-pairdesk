// Rate-limit test against the COMPILED build (dist/). No Postgres needed: unauthenticated
// /api requests are rejected by requireAuth (401) before touching the DB, and the webhook
// rejects a missing secret (401) before processing. 401s still count toward the limits,
// which is the point: they are the traffic an attacker would send.
// Run via: npm run test:ratelimit
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';

// config.ts reads process.env at import time: set tiny limits BEFORE importing it.
process.env.RATE_LIMIT_WINDOW_SECONDS = '60';
process.env.RATE_LIMIT_API_IP_MAX = '4';
process.env.RATE_LIMIT_WEBHOOK_MAX = '3';
delete process.env.TRUST_PROXY; // exercise the default (1 hop)
process.env.TRUST_CF_CONNECTING_IP = 'true'; // flag-off behaviour: ratelimit-cf-off.test.mjs

const { createApp } = await import('../../dist/app.js');
const { createUserLimiter } = await import('../../dist/middleware/rateLimit.js');

const servers = [];
let base;

async function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

before(async () => {
  base = await listen(createApp({ publicDir: '/nonexistent' }));
});
after(() => {
  for (const s of servers) s.close();
});

const call = (path, init = {}) => fetch(base + path, init);

test('probes, metrics and static paths are never rate limited', async () => {
  for (let i = 0; i < 30; i++) {
    for (const p of ['/healthz', '/metrics']) {
      const r = await call(p);
      assert.equal(r.status, 200, `${p} request ${i}`);
    }
  }
  // Static/SPA path: 404 here (empty public dir), but never 429.
  for (let i = 0; i < 30; i++) assert.notEqual((await call('/app')).status, 429);
});

test('/api is limited per client IP and answers 429 with Retry-After', async () => {
  const statuses = [];
  let last;
  for (let i = 0; i < 6; i++) {
    last = await call('/api/me');
    statuses.push(last.status);
  }
  assert.deepEqual(statuses, [401, 401, 401, 401, 429, 429]);
  assert.deepEqual(await last.json(), { error: 'rate limited' });
  assert.ok(last.headers.get('retry-after'), 'Retry-After header present');
});

test('trust proxy: distinct X-Forwarded-For clients get separate buckets', async () => {
  // 127.0.0.1 is exhausted by the previous test; another client behind the proxy is not.
  const other = await call('/api/me', { headers: { 'x-forwarded-for': '203.0.113.7' } });
  assert.equal(other.status, 401);
  const exhaustedStill = await call('/api/me');
  assert.equal(exhaustedStill.status, 429);
});

test('webhook is IP limited, independently of /api', async () => {
  const statuses = [];
  for (let i = 0; i < 5; i++) {
    const r = await call('/telegram/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.9' },
      body: '{}',
    });
    statuses.push(r.status);
  }
  assert.deepEqual(statuses, [401, 401, 401, 429, 429]);
});

test('user limiter keys by user id, falls back to IP when no user is attached', async () => {
  const app = express();
  app.use(createUserLimiter(2, (req) => (req.headers['x-user'] ? Number(req.headers['x-user']) : undefined)));
  app.get('/x', (_req, res) => res.json({ ok: true }));
  const url = await listen(app);
  const hit = (user) => fetch(url + '/x', { headers: user ? { 'x-user': user } : {} }).then((r) => r.status);

  assert.deepEqual([await hit('1'), await hit('1'), await hit('1')], [200, 200, 429]);
  // A different user from the same IP is unaffected.
  assert.equal(await hit('2'), 200);
  // Anonymous requests share the IP bucket.
  assert.deepEqual([await hit(), await hit(), await hit()], [200, 200, 429]);
});

// --- TRUST_CF_CONNECTING_IP=true -------------------------------------------------------

const cf = (ip) => ({ 'cf-connecting-ip': ip });
const api = (headers) => call('/api/me', { headers }).then((r) => r.status);
const hook = (headers) =>
  call('/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' }).then(
    (r) => r.status,
  );

test('flag on: distinct CF-Connecting-IP clients get separate /api buckets', async () => {
  // Same req.ip (127.0.0.1, the "edge") for all of them.
  for (let i = 0; i < 4; i++) assert.equal(await api(cf('192.0.2.10')), 401);
  assert.equal(await api(cf('192.0.2.10')), 429);
  assert.equal(await api(cf('192.0.2.11')), 401, 'another client is unaffected');
});

test('flag on: CF-Connecting-IP wins over X-Forwarded-For', async () => {
  const h = (xff) => ({ ...cf('192.0.2.20'), 'x-forwarded-for': xff });
  for (let i = 0; i < 4; i++) assert.equal(await api(h(`203.0.113.${i}`)), 401);
  assert.equal(await api(h('203.0.113.99')), 429, 'rotating XFF does not dodge the CF-keyed bucket');
});

test('flag on: webhook limiter is keyed by CF-Connecting-IP too', async () => {
  const statuses = [];
  for (let i = 0; i < 4; i++) statuses.push(await hook(cf('192.0.2.30')));
  assert.deepEqual(statuses, [401, 401, 401, 429]);
  assert.equal(await hook(cf('192.0.2.31')), 401);
});

test('flag on: IPv6 clients share a /56 bucket (ipKeyGenerator subnetting)', async () => {
  for (let i = 0; i < 4; i++) assert.equal(await api(cf(`2001:db8:abcd:12${i}0::1`)), 401);
  // Fifth address in the same /56 (2001:db8:abcd:1200::/56) is over the limit.
  assert.equal(await api(cf('2001:db8:abcd:12ff::9')), 429);
  assert.equal(await api(cf('2001:db8:abce:1200::1')), 401, 'different /56');
});

test('flag on: invalid, list or empty CF-Connecting-IP falls back to req.ip', async () => {
  // req.ip is 127.0.0.1 here, already exhausted by the earlier /api test.
  for (const bad of ['not-an-ip', '192.0.2.40, 192.0.2.41', '192.0.2.40:8080', '']) {
    assert.equal(await api(bad === '' ? {} : cf(bad)), 429, `value: ${JSON.stringify(bad)}`);
  }
});

test('flag on: user limiter IP fallback uses CF-Connecting-IP', async () => {
  const app = express();
  app.use(createUserLimiter(1, () => undefined));
  app.get('/x', (_req, res) => res.json({ ok: true }));
  const url = await listen(app);
  const hit = (ip) => fetch(url + '/x', { headers: cf(ip) }).then((r) => r.status);
  assert.deepEqual([await hit('192.0.2.60'), await hit('192.0.2.60'), await hit('192.0.2.61')], [200, 429, 200]);
});

test('no resolvable address: shared bucket, no crash', async () => {
  const app = express();
  app.use((req, _res, next) => {
    Object.defineProperty(req, 'ip', { value: undefined });
    next();
  });
  app.use(createUserLimiter(1, () => undefined));
  app.get('/x', (_req, res) => res.json({ ok: true }));
  const url = await listen(app);
  const hit = () => fetch(url + '/x').then((r) => r.status);
  assert.deepEqual([await hit(), await hit()], [200, 429]);
});
