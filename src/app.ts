import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { requireAuth } from './middleware/auth.js';
import { adminRouter } from './routes/admin.js';
import { webhookRouter } from './routes/webhook.js';
import { dealsRouter } from './routes/deals.js';
import { meRouter } from './routes/me.js';
import { ordersRouter } from './routes/orders.js';
import { ratesRouter } from './routes/rates.js';
import { subscriptionsRouter } from './routes/subscriptions.js';

const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');

/**
 * Build the HTTP app without listening, so the routing test can boot it on an
 * ephemeral port over a fixture public dir. server.ts owns startup (migrations,
 * sweeper, listen).
 */
export function createApp({ publicDir = PUBLIC_DIR }: { publicDir?: string } = {}): Express {
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
  app.use(express.static(publicDir));

  // ---- Mini App SPA fallback ----
  app.get(['/app', '/app/*', '/admin', '/admin/*', '/docs', '/docs/*'], (_req, res) => {
    res.sendFile(resolve(publicDir, 'app', 'index.html'), (err) => {
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
    // Honour a 4xx status set by upstream middleware (e.g. body-parser's 400 on
    // malformed JSON) rather than masking every failure as a 500.
    const s = (err as { status?: number; statusCode?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
    const status = typeof s === 'number' && s >= 400 && s < 500 ? s : 500;
    res.status(status).json({ error: status === 500 ? 'internal error' : 'bad request' });
  });

  return app;
}
