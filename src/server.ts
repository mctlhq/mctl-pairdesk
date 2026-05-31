import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { pool } from './db/pool.js';
import { requireAuth } from './middleware/auth.js';
import { getDefaultCommunityId } from './services/community.js';
import { expireStaleOrders } from './services/orders.js';
import { setWebhook } from './telegram/bot.js';
import { adminRouter } from './routes/admin.js';
import { webhookRouter } from './routes/webhook.js';
import { dealsRouter } from './routes/deals.js';
import { meRouter } from './routes/me.js';
import { ordersRouter } from './routes/orders.js';
import { ratesRouter } from './routes/rates.js';
import { subscriptionsRouter } from './routes/subscriptions.js';

const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

// ---- liveness / readiness / metrics ----
app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', version: config.serviceVersion });
});

app.get('/readyz', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not-ready' });
  }
});

app.get('/metrics', (_req, res) => {
  res
    .type('text/plain')
    .send(['# HELP mctl_pairdesk_up Service is up.', '# TYPE mctl_pairdesk_up gauge', 'mctl_pairdesk_up 1'].join('\n') + '\n');
});

// ---- Telegram bot webhook (public; authenticated by the secret-token header) ----
app.use('/', webhookRouter);

// ---- API (all routes require Telegram auth; per-router approval/role gates) ----
const api = express.Router();
api.use(requireAuth());
api.use('/', meRouter); // reachable by pending users
api.use('/', ordersRouter);
api.use('/', dealsRouter);
api.use('/', subscriptionsRouter);
api.use('/', ratesRouter);
api.use('/admin', adminRouter);
app.use('/api', api);

// ---- static assets (the React Mini App build lands here in Stage 3) ----
app.use(express.static(PUBLIC_DIR));

// ---- Mini App SPA fallback ----
app.get(['/app', '/app/*', '/admin', '/admin/*', '/docs', '/docs/*'], (_req, res) => {
  res.sendFile(resolve(PUBLIC_DIR, 'index.html'), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'mini app not built' });
  });
});

// ---- catch-all ----
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'GET') return next();
  return res.status(404).json({ error: 'not found' });
});

// ---- error handler ----
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error('[error]', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'internal error' });
});

// Expire stale active orders. Idempotent and safe on every replica; runs on boot
// (catches orders that lapsed while the pod was down) then on a fixed interval.
function sweepExpiredOrders(): void {
  expireStaleOrders()
    .then((n) => {
      // eslint-disable-next-line no-console
      if (n > 0) console.log(`[sweeper] expired ${n} stale order(s)`);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[sweeper] expireStaleOrders failed', err);
    });
}

async function main(): Promise<void> {
  if (config.databaseUrl) {
    await migrate();
    await getDefaultCommunityId(); // seed + cache the single community
    sweepExpiredOrders();
    setInterval(sweepExpiredOrders, 60_000);
    void setWebhook(); // register the bot webhook when TELEGRAM_WEBHOOK_URL is set
  } else {
    // eslint-disable-next-line no-console
    console.warn('[startup] DATABASE_URL not set — skipping migrations (dev only)');
  }
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[startup] mctl-pairdesk ${config.serviceVersion} listening on :${config.port} (env=${config.appEnv})`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[startup] fatal', err);
  process.exit(1);
});
