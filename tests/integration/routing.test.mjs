// HTTP routing + boot test: SPA fallback, static assets, API mounts, and the real
// entrypoint starting up. Runs against the COMPILED build (dist/) like the other
// integration tests, but needs no Postgres: no request gets past requireAuth, and
// the spawned server boots without DATABASE_URL. A route pattern the router rejects
// at registration (path-to-regexp 8 throws on a bare `*`) fails here instead of
// crash-looping the pod. Run via: npm run test:routing
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const { createApp } = await import('../../dist/app.js');
const SERVER_JS = fileURLToPath(new URL('../../dist/server.js', import.meta.url));

const SPA = '<!doctype html><title>spa fixture</title>';
const LANDING = '<!doctype html><title>landing fixture</title>';
const ASSET = 'console.log("asset fixture");';

let tmp;
const servers = [];
let built; // base URL of an app whose public/ holds the landing + Mini App builds
let unbuilt; // base URL of an app whose public/ is empty

async function boot(publicDir) {
  const server = createApp({ publicDir }).listen(0, '127.0.0.1');
  servers.push(server);
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

before(async () => {
  // The public/ dirs sit under a dot-directory, as in a checkout under ~/.worktrees,
  // so serving must not depend on where the repo lives.
  tmp = mkdtempSync(join(tmpdir(), 'pairdesk-routing-'));
  const pub = join(tmp, '.checkout', 'public');
  const empty = join(tmp, '.checkout', 'empty');
  mkdirSync(join(pub, 'app', 'assets'), { recursive: true });
  mkdirSync(empty, { recursive: true });
  writeFileSync(join(pub, 'index.html'), LANDING);
  writeFileSync(join(pub, 'app', 'index.html'), SPA);
  writeFileSync(join(pub, 'app', 'assets', 'index-abc123.js'), ASSET);
  built = await boot(pub);
  unbuilt = await boot(empty);
});

after(() => {
  for (const s of servers) s.close();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

const get = (base, path, init = {}) => fetch(base + path, { redirect: 'manual', ...init });

test('SPA fallback serves the Mini App shell for client routes, bare and nested', async () => {
  const paths = [
    '/app/',
    '/app/x',
    '/app/x/y',
    '/app/x/y/',
    '/app/assets/missing.js', // a missing file under /app is a client route like any other
    '/admin',
    '/admin/',
    '/admin/users',
    '/admin/users/42',
    '/docs',
    '/docs/',
    '/docs/y',
    '/docs/y/z',
    '/docs/y?tab=1',
    '/Docs/y', // routing is case-insensitive
  ];
  for (const path of paths) {
    const res = await get(built, path);
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get('content-type') ?? '', /^text\/html/, path);
    assert.equal(await res.text(), SPA, path);
  }
});

test('bare /app redirects to /app/, because public/app is a real directory', async () => {
  const res = await get(built, '/app');
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), '/app/');
});

test('client routes answer 404 JSON when the Mini App is not built', async () => {
  // With no public/app directory, bare /app reaches the fallback route itself.
  for (const path of ['/app', '/app/', '/app/x/y', '/admin', '/admin/users/42', '/docs', '/docs/y']) {
    const res = await get(unbuilt, path);
    assert.equal(res.status, 404, path);
    assert.deepEqual(await res.json(), { error: 'mini app not built' }, path);
  }
});

test('real static files are served by express.static, not the fallback', async () => {
  const asset = await get(built, '/app/assets/index-abc123.js');
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('content-type') ?? '', /javascript/);
  assert.equal(await asset.text(), ASSET);

  const landing = await get(built, '/');
  assert.equal(landing.status, 200);
  assert.equal(await landing.text(), LANDING);
});

test('API, health and webhook routes are not swallowed by the fallback', async () => {
  // /api/admin/* in particular must reach the authenticated API, not the /admin SPA route.
  for (const path of ['/api/me', '/api/orders/1', '/api/admin/users', '/api/admin/users/42/approve']) {
    const res = await get(built, path);
    assert.equal(res.status, 401, path);
    assert.deepEqual(await res.json(), { error: 'unauthorized' }, path);
  }

  const health = await get(built, '/healthz');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');

  const metrics = await get(built, '/metrics');
  assert.equal(metrics.status, 200);
  assert.match(await metrics.text(), /^mctl_pairdesk_up 1$/m);

  // No TELEGRAM_WEBHOOK_SECRET in this process, so the webhook fails closed.
  const hook = await get(built, '/telegram/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(hook.status, 401);
});

test('JSON body errors keep their 4xx status: malformed is 400, over the 64kb limit is 413', async (t) => {
  t.mock.method(console, 'error', () => {}); // the error handler logs each rejected body
  const post = (body) =>
    get(built, '/api/me', { method: 'POST', headers: { 'content-type': 'application/json' }, body });

  const malformed = await post('{"a":');
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: 'bad request' });

  const oversized = await post(JSON.stringify({ pad: 'x'.repeat(64 * 1024) }));
  assert.equal(oversized.status, 413);
  assert.deepEqual(await oversized.json(), { error: 'bad request' });
});

test('paths that only share a prefix with a client route reach the 404 catch-all', async () => {
  for (const path of ['/apps', '/apps/', '/appx/y', '/administrator', '/docsx', '/nope', '/nope/x']) {
    const res = await get(built, path);
    assert.equal(res.status, 404, path);
    assert.deepEqual(await res.json(), { error: 'not found' }, path);
  }
});

test('non-GET requests to client routes do not get the SPA shell', async () => {
  for (const path of ['/app/x', '/docs/y']) {
    const res = await get(built, path, { method: 'POST' });
    assert.equal(res.status, 404, path);
    assert.notEqual(await res.text(), SPA, path);
  }
});

// ---- the real entrypoint (dist/server.js) ----

// A listener on a free port. listen() without a host binds the same address the
// server does, so a server started on this port while it is held gets EADDRINUSE.
async function holdPort() {
  const holder = createServer().listen(0);
  await once(holder, 'listening');
  return holder;
}

function startServer(port) {
  const child = spawn(process.execPath, [SERVER_JS], {
    env: { ...process.env, PORT: String(port), DATABASE_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  const exited = once(child, 'exit').then(([code]) => code);
  return { child, exited, output: () => output };
}

test('dist/server.js boots and answers /healthz', { timeout: 30_000 }, async (t) => {
  const holder = await holdPort();
  const { port } = holder.address();
  holder.close();
  await once(holder, 'close');

  const srv = startServer(port);
  t.after(() => srv.child.kill());
  for (;;) {
    assert.equal(srv.child.exitCode, null, `server exited early:\n${srv.output()}`);
    const res = await fetch(`http://127.0.0.1:${port}/healthz`).catch(() => null);
    if (res?.status === 200) break;
    await sleep(100);
  }
});

test('dist/server.js exits non-zero when its port is taken', { timeout: 30_000 }, async (t) => {
  const holder = await holdPort();
  t.after(() => holder.close());

  const srv = startServer(holder.address().port);
  t.after(() => srv.child.kill());
  assert.equal(await srv.exited, 1, srv.output());
  assert.match(srv.output(), /EADDRINUSE/);
});
