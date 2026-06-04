import type { TestUser } from './initData.js';

// A and B are listed in SUPER_ADMIN_TELEGRAM_IDS for the test server, so they are
// auto-approved — the order-lifecycle smoke isn't about the join gate. C is NOT a
// super-admin: it lands `pending` and drives the closed-community approval-gate test.
export const USER_A: TestUser = { id: 700100100, username: 'maker_a', first_name: 'Maker' };
export const USER_B: TestUser = { id: 700200200, username: 'responder_b', first_name: 'Responder' };
export const USER_C: TestUser = { id: 700300300, username: 'pending_c', first_name: 'Pending' };
