import { isIP } from 'node:net';
import type { Request, RequestHandler, Response } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { config } from '../config.js';
import { getCtx } from './auth.js';

// In-memory stores: counters are per process. This is correct only while the
// service runs as a single replica (it does today); with N replicas the effective
// limit is N x the configured value. Move to a shared store before scaling out.

const common = {
  windowMs: config.rateLimitWindowMs,
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({ error: 'rate limited' });
  },
};

/**
 * CF-Connecting-IP, when TRUST_CF_CONNECTING_IP is on and the header is exactly one
 * valid IP address (no lists, no junk). Otherwise undefined.
 */
function cfConnectingIp(req: Request): string | undefined {
  if (!config.trustCfConnectingIp) return undefined;
  const raw = req.headers['cf-connecting-ip'];
  if (typeof raw !== 'string') return undefined; // absent, or repeated (array)
  const value = raw.trim();
  return isIP(value) !== 0 ? value : undefined;
}

function clientIp(req: Request): string {
  const address = cfConnectingIp(req) ?? req.ip;
  if (!address) return 'unknown'; // no resolvable address: one shared bucket, never a crash
  return ipKeyGenerator(address);
}

/** Per authenticated user, falling back to the client IP when no user is attached. */
export function createUserLimiter(limit: number, getUserId: (req: Request) => number | undefined): RequestHandler {
  return rateLimit({
    ...common,
    limit,
    keyGenerator: (req) => {
      const id = getUserId(req);
      return id !== undefined ? `u:${id}` : clientIp(req);
    },
  });
}

function userIdFromCtx(req: Request): number | undefined {
  try {
    return getCtx(req).userId;
  } catch {
    return undefined; // not behind requireAuth
  }
}

/** /api before auth: protects the initData verification + user upsert from floods. */
export const apiIpLimiter: RequestHandler = rateLimit({
  ...common,
  limit: config.rateLimitApiIpMax,
  keyGenerator: clientIp,
});

/** /api after auth: per user, else per IP. */
export const apiUserLimiter: RequestHandler = createUserLimiter(config.rateLimitApiUserMax, userIdFromCtx);

/** Telegram webhook: IP based and generous. */
export const webhookLimiter: RequestHandler = rateLimit({
  ...common,
  limit: config.rateLimitWebhookMax,
  keyGenerator: clientIp,
});
