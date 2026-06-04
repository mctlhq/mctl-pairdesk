import type { Browser, Page } from '@playwright/test';
import { signInitData, type TestUser } from '../fixtures/initData.js';
import { telegramMockScript } from '../fixtures/telegram-mock.js';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8099';
const BOT_TOKEN = process.env.PAIRDESK_TEST_BOT_TOKEN ?? 'test:HARNESS';

/**
 * Open the Mini App directly (no Telegram, no iframe) as a given community member.
 * Installs the fake WebApp SDK with a freshly-signed initData and blocks the real
 * telegram-web-app.js so it can't overwrite the mock. Each call gets its own isolated
 * browser context so two users (A maker / B responder) can act in the same test.
 */
export async function openApp(browser: Browser, user: TestUser): Promise<Page> {
  const ctx = await browser.newContext();
  await ctx.addInitScript(telegramMockScript(signInitData(user, BOT_TOKEN)));
  await ctx.route('**/telegram-web-app.js', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '/* mocked by e2e harness */' }),
  );
  const page = await ctx.newPage();
  await page.goto(`${BASE_URL}/app/`);
  return page;
}

/** Fire the native Telegram MainButton callback (the app's primary CTA). */
export async function clickMainButton(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __tg: { clickMain(): void } }).__tg.clickMain());
}

/** Fire the native Telegram BackButton callback. */
export async function clickBackButton(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __tg: { clickBack(): void } }).__tg.clickBack());
}

/** Read the current MainButton state (text/visible/active) for assertions. */
export async function mainButtonState(page: Page): Promise<{ text: string; visible: boolean; active: boolean }> {
  return page.evaluate(
    () => (window as unknown as { __tg: { main: { text: string; visible: boolean; active: boolean } } }).__tg.main,
  );
}
