import type { TestUser } from './initData.js';

// Two distinct community members. Both ids are listed in SUPER_ADMIN_TELEGRAM_IDS
// for the test server so they are auto-approved (the closed-community approval
// gate is covered by its own dedicated test, not the order-lifecycle smoke).
export const USER_A: TestUser = { id: 700100100, username: 'maker_a', first_name: 'Maker' };
export const USER_B: TestUser = { id: 700200200, username: 'responder_b', first_name: 'Responder' };
