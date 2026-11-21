// TRUST_CF_CONNECTING_IP unset (default) / not the literal "true": the CF-Connecting-IP
// header must be ignored, otherwise anyone could mint a fresh bucket per request by
// forging it. Separate file because config.ts reads process.env at import time.
// Run via: npm run test:ratelimit
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

process.env.RATE_LIMIT_WINDOW_SECONDS = '60';
process.env.RATE_LIMIT_API_IP_MAX = '3';
process.env.RATE_LIMIT_WEBHOOK_MAX = '3';
delete process.env.TRUST_PROXY;
delete process.env.TRUST_CF_CONNECTING_IP;

const { createApp } = await import('../../dist/app.js');

let server;
let base;
before(async () => {
  server = createApp({ publicDir: '/nonexistent' }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('flag off: rotating CF-Connecting-IP does not mint new /api buckets', async () => {
  const statuses = [];
  for (let i = 0; i < 5; i++) {
    const r = await fetch(base + '/api/me', { headers: { 'cf-connecting-ip': `192.0.2.${i + 1}` } });
    statuses.push(r.status);
  }
  assert.deepEqual(statuses, [401, 401, 401, 429, 429]);
});

test('flag off: rotating CF-Connecting-IP does not mint new webhook buckets', async () => {
  const statuses = [];
  for (let i = 0; i < 5; i++) {
    const r = await fetch(base + '/telegram/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': `198.51.100.${i + 1}` },
      body: '{}',
    });
    statuses.push(r.status);
  }
  assert.deepEqual(statuses, [401, 401, 401, 429, 429]);
});

test('flag off: probes stay unlimited', async () => {
  for (let i = 0; i < 20; i++) assert.equal((await fetch(base + '/healthz')).status, 200);
});
