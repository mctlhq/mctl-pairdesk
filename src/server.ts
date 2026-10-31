import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { getDefaultCommunityId } from './services/community.js';
import { expireStaleOrders } from './services/orders.js';
import { setWebhook } from './telegram/bot.js';

const app = createApp();

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
