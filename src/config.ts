// Central runtime configuration, read once from the environment.

function intEnv(name: string, def: number): number {
  const raw = process.env[name];
  if (!raw) return def;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : def;
}

function listEnv(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function trustProxyEnv(name: string, def: number): number | boolean | string {
  const raw = process.env[name]?.trim();
  if (!raw) return def;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^\d+$/.test(raw)) return Number.parseInt(raw, 10);
  return raw; // e.g. "loopback, 10.0.0.0/8" — passed through to Express
}

export const config = {
  port: intEnv('PORT', 8080),
  appEnv: process.env.APP_ENV ?? 'development',
  serviceVersion: process.env.SERVICE_VERSION ?? '0.1.0',

  // Postgres. The platform injects DATABASE_URL via the base-service db ExternalSecret.
  databaseUrl: process.env.DATABASE_URL ?? '',

  // Telegram bot token (BotFather). Used for initData verification + notifications.
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? '',

  // Comma-separated Telegram user ids that are platform super-admins. These users
  // are always treated as community admins regardless of their stored role, and
  // are auto-approved on first sight (so the very first admin can get in).
  superAdminIds: new Set(listEnv('SUPER_ADMIN_TELEGRAM_IDS')),

  // Single-community MVP: every row carries community_id, but only one community
  // exists. Resolved/seeded by slug at startup (see services/community.ts).
  defaultCommunitySlug: process.env.COMMUNITY_SLUG ?? 'default',
  defaultCommunityName: process.env.COMMUNITY_NAME ?? 'PairDesk Community',

  // initData freshness window in seconds (reject stale Mini App auth payloads).
  initDataMaxAgeSeconds: intEnv('INITDATA_MAX_AGE_SECONDS', 86400),

  // Telegram bot webhook. webhookUrl is the public HTTPS URL Telegram POSTs
  // updates to (e.g. https://pairdesk.example/telegram/webhook); when set with a
  // token, the bot registers it on startup. webhookSecret is echoed back by
  // Telegram in the X-Telegram-Bot-Api-Secret-Token header and verified.
  webhookUrl: process.env.TELEGRAM_WEBHOOK_URL ?? '',
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',

  // Public HTTPS URL of the Mini App (the /app route), used for the "Open
  // PairDesk" web_app button in bot messages. Empty → buttons omit it.
  miniAppUrl: process.env.MINI_APP_URL ?? '',

  // Default order lifetime in seconds before the expiry sweeper marks it expired
  // (default 72h). Clients may pass a shorter explicit expiry.
  orderTtlSeconds: intEnv('ORDER_TTL_SECONDS', 259_200),

  // When true (local dev only), accept an X-Debug-User-Id header instead of real
  // Telegram initData. Hard-disabled when APP_ENV=production so an accidental env
  // flag can never open an auth bypass in prod.
  authDevBypass:
    process.env.AUTH_DEV_BYPASS === 'true' && (process.env.APP_ENV ?? 'development') !== 'production',

  // Reverse-proxy hops to trust for req.ip (X-Forwarded-For). The platform
  // ingress puts exactly one proxy in front of the pod, hence the default of 1.
  // Accepts a hop count, true/false, or an Express trust-proxy string.
  trustProxy: trustProxyEnv('TRUST_PROXY', 1),

  // In-memory rate limits (per replica, fixed window of RATE_LIMIT_WINDOW_SECONDS).
  rateLimitWindowMs: intEnv('RATE_LIMIT_WINDOW_SECONDS', 60) * 1000,
  // /api, pre-auth, keyed by client IP (shared NAT / mobile carriers => generous).
  rateLimitApiIpMax: intEnv('RATE_LIMIT_API_IP_MAX', 600),
  // /api, post-auth, keyed by the authenticated user.
  rateLimitApiUserMax: intEnv('RATE_LIMIT_API_USER_MAX', 240),
  // Telegram webhook, keyed by IP. Telegram sends from a few fixed addresses, so
  // this is a flood backstop, not a per-user limit.
  rateLimitWebhookMax: intEnv('RATE_LIMIT_WEBHOOK_MAX', 3000),
} as const;

export function isSuperAdmin(telegramId: string | number): boolean {
  return config.superAdminIds.has(String(telegramId));
}

// Supported assets and order pairs for the MVP order book.
export const ASSETS = ['EUR', 'RUB', 'USDT'] as const;
export type Asset = (typeof ASSETS)[number];

export function isAsset(v: unknown): v is Asset {
  return typeof v === 'string' && (ASSETS as readonly string[]).includes(v);
}
