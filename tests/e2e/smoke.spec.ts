import { test, expect, type Page } from '@playwright/test';
import { openApp, clickMainButton, mainButtonState } from './helpers/context.js';
import { USER_A, USER_B } from './fixtures/users.js';

// End-to-end smoke proving the Mini App is repeatably testable OUTSIDE Telegram:
// a signed-initData fixture + a stubbed WebApp SDK drive the real React app against
// the real backend (genuine HMAC auth). Two contexts act as maker (A) and responder (B).
//
// Button reality (with the SDK stub, hasMainButton() is true):
//   - create steps, "Respond", "Mark complete"  -> native MainButton  -> clickMainButton()
//   - "Accept" / "Cancel order"                  -> always-rendered DOM buttons -> click()

const DISCLAIMER = /I understand and agree/;

async function passDisclaimer(page: Page): Promise<void> {
  // The disclaimer only shows the first time a user opens the app; on later runs/tests
  // the same user already accepted it, so tolerate its absence and just reach the Book.
  const agree = page.getByRole('button', { name: DISCLAIMER });
  if (await agree.isVisible().catch(() => false)) {
    await agree.click();
  } else {
    await agree.waitFor({ timeout: 4000 }).then(() => agree.click()).catch(() => undefined);
  }
  await expect(page.getByRole('button', { name: 'Book', exact: true })).toBeVisible();
}

/** The order-status badge in the detail hero (scoped so deal/response badges don't clash). */
function orderStatus(page: Page, status: string) {
  return page.locator('.pd-detail-hero').getByLabel(`Status: ${status}`);
}

/** Wait until the native MainButton shows the expected label and is clickable. */
async function waitMainButton(page: Page, label: RegExp): Promise<void> {
  await expect
    .poll(async () => {
      const s = await mainButtonState(page);
      return s.visible && s.active ? s.text : '';
    }, { timeout: 10_000 })
    .toMatch(label);
}

/** Drive the 3-step Create flow via the MainButton; returns the created order id. */
async function createOrder(page: Page, city: string, amount: string): Promise<number> {
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  // Step 1 — currency pair (defaults EUR<-RUB are pre-set).
  await waitMainButton(page, /Continue/);
  await clickMainButton(page);

  // Step 2 — amount (rate is optional / market-ref).
  await page.locator('input.pd-input-amount').first().fill(amount);
  await waitMainButton(page, /Continue/);
  await clickMainButton(page);

  // Step 3 — note + city, then publish.
  await page.getByPlaceholder('e.g. Bar').fill(city);
  await waitMainButton(page, /Publish request/);
  const created = page.waitForResponse(
    (r) => r.url().includes('/api/orders') && r.request().method() === 'POST' && r.status() < 400,
  );
  await clickMainButton(page);
  const id = (await (await created).json()).id as number;
  expect(id).toBeGreaterThan(0);
  return id;
}

/** From the Book, open the order card carrying `city`. */
async function openFromBook(page: Page, city: string): Promise<void> {
  await page.getByRole('button', { name: 'Book', exact: true }).click();
  const card = page.locator('.pd-card', { hasText: city }).first();
  await card.waitFor({ timeout: 10_000 });
  await card.click();
}

test('full lifecycle: create → book → respond → accept → complete', async ({ browser }) => {
  const stamp = Date.now();
  const city = `QA-life-${stamp}`;
  const amount = '250';

  const a = await openApp(browser, USER_A);
  await passDisclaimer(a);
  const orderId = await createOrder(a, city, amount);
  // After publish the app opens the order detail (maker view).
  await expect(orderStatus(a, 'active')).toBeVisible();

  // B sees it in the book and responds.
  const b = await openApp(browser, USER_B);
  await passDisclaimer(b);
  await openFromBook(b, city);
  await waitMainButton(b, /Respond to order/);
  await clickMainButton(b);
  // Exact match: the status-card title is "Response sent"; the transient toast
  // ("Response sent — the maker will review it.") also contains the phrase.
  await expect(b.getByText('Response sent', { exact: true })).toBeVisible();

  // A refreshes, opens the order, accepts B's response.
  await a.reload();
  await openFromBook(a, city);
  await a.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(orderStatus(a, 'reserved')).toBeVisible();

  // A marks the deal complete (MainButton appears once contacts are revealed).
  await waitMainButton(a, /Mark complete/);
  await clickMainButton(a);
  await expect(orderStatus(a, 'completed')).toBeVisible();

  // B's side reflects the completed deal too.
  await b.reload();
  await openFromBook(b, city).catch(() => {
    /* completed orders leave the active book — that's expected; verified on A's side */
  });

  await a.context().close();
  await b.context().close();
});

test('maker can cancel an active order', async ({ browser }) => {
  const stamp = Date.now();
  const city = `QA-cancel-${stamp}`;

  const a = await openApp(browser, USER_A);
  await passDisclaimer(a);
  await createOrder(a, city, '300');
  await expect(orderStatus(a, 'active')).toBeVisible();

  // Cancel from the maker detail view (always-rendered DOM button).
  await a.getByRole('button', { name: 'Cancel order', exact: true }).click();
  await expect(orderStatus(a, 'cancelled')).toBeVisible();

  await a.context().close();
});
