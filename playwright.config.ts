import { defineConfig } from '@playwright/test';

const PORT = process.env.PAIRDESK_TEST_PORT ?? '8099';
const BOT_TOKEN = process.env.PAIRDESK_TEST_BOT_TOKEN ?? 'test:HARNESS';
const DB_URL = process.env.DATABASE_URL ?? 'postgres://pairdesk:pairdesk@localhost:5433/pairdesk_test';
const BASE_URL = `http://localhost:${PORT}`;

// NOTE: bring Postgres up + reset it BEFORE this runs (the `test:e2e` npm script chains
// `scripts/test-db.sh`). The app server migrates + seeds the community on boot, so it
// needs a ready, empty DB. No real secrets: the bot token is a throwaway used both to
// sign fixture initData and to boot the server, exercising the genuine HMAC path.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run build:web && npm run build:api && node dist/server.js',
    url: `${BASE_URL}/healthz`,
    timeout: 180_000,
    // Always boot a fresh server: `test:db:up` resets the DB each run, so the server
    // must (re-)migrate against it. Reusing a stale server would hold dropped connections.
    reuseExistingServer: false,
    env: {
      PORT,
      APP_ENV: 'test',
      DATABASE_URL: DB_URL,
      DATABASE_SSL: 'false',
      TELEGRAM_BOT_TOKEN: BOT_TOKEN,
      SUPER_ADMIN_TELEGRAM_IDS: '700100100,700200200',
      COMMUNITY_SLUG: 'default',
      COMMUNITY_NAME: 'E2E Test Community',
      INITDATA_MAX_AGE_SECONDS: '86400',
    },
  },
});
