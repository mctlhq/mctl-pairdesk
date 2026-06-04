import { test, expect, type Page } from '@playwright/test';
import { openApp, clickMainButton, mainButtonState, apiAs } from './helpers/context.js';
import { USER_A, USER_B, USER_C } from './fixtures/users.js';

// End-to-end smoke proving the Mini App is repeatably testable OUTSIDE Telegram:
// a signed-initData fixture + a stubbed WebApp SDK drive the real React app against
// the real backend (genuine HMAC auth). Two contexts act as maker (A) and responder (B).
//
// Button reality (with the SDK stub, hasMainButton() is true):
//   - create steps, "Respond", "Mark complete"  -> native MainButton  -> clickMainButton()
//   - "Accept" / "Cancel order"                  -> always-rendered DOM buttons -> click()

const DISCLAIMER = /I understand and agree/;

async function passDisclaimer(page: Page): Promise<void> {
  // Acceptance is stored server-side (users.disclaimer_accepted_at), so a first-time user
  // sees the disclaimer while a returning one goes straight to the Book. Wait for whichever
  // appears (no fixed delay), accept if present, then confirm we reached the Book.
  const agree = page.getByRole('button', { name: DISCLAIMER });
  const book = page.getByRole('button', { name: 'Book', exact: true });
  await expect(agree.or(book)).toBeVisible();
  if (await agree.isVisible()) await agree.click();
  await expect(book).toBeVisible();
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

  // A completed order leaves the active book — assert its absence positively (fast),
  // rather than waiting out a swallowed open-timeout.
  await b.reload();
  await b.getByRole('button', { name: 'Book', exact: true }).click();
  await expect(b.locator('.pd-card', { hasText: city })).toHaveCount(0);

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

test('closed community: a non-member stays pending until an admin approves', async ({ browser }) => {
  // C is not a super-admin → lands pending after accepting the disclaimer.
  const c = await openApp(browser, USER_C);
  await c.getByRole('button', { name: DISCLAIMER }).click();
  await expect(c.getByText('Awaiting approval')).toBeVisible();
  // No Book access while pending.
  await expect(c.getByRole('button', { name: 'Book', exact: true })).toHaveCount(0);

  // Admin A approves C through the real, role-gated admin endpoints (the production
  // path is a bot callback, not an in-app screen — so this step is API, not UI).
  const admin = await openApp(browser, USER_A);
  await passDisclaimer(admin);
  const adminApi = apiAs(admin, USER_A);
  const pending = await (await adminApi.get('/admin/users/pending')).json();
  const row = pending.users.find((u: { username?: string }) => u.username === USER_C.username);
  expect(row, 'C should appear in the pending list').toBeTruthy();
  expect((await adminApi.post(`/admin/users/${row.id}/approve`)).ok()).toBeTruthy();

  // C now has access.
  await c.reload();
  await expect(c.getByRole('button', { name: 'Book', exact: true })).toBeVisible();

  await c.context().close();
  await admin.context().close();
});
