// The message edit that resolves an approve_user/reject_user prompt must carry no
// keyboard; deal resolutions keep the "Open PairDesk" button. Runs against the
// COMPILED build (dist/) like the other integration tests, no Postgres needed.
// Run via: npm run test:webhook
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.MINI_APP_URL = 'https://app.example.test/';
// tgApi returns before fetch without a bot token; config is read at import time.
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
const { resolvedKeyboard } = await import('../../dist/telegram/webhook.js');
const { editMessageText } = await import('../../dist/telegram/bot.js');

test('approve_user / reject_user resolutions send no buttons', () => {
  assert.equal(resolvedKeyboard('approve_user'), undefined);
  assert.equal(resolvedKeyboard('reject_user'), undefined);
});

test('deal resolutions keep the open-app button (precondition: it is configured)', () => {
  const kb = resolvedKeyboard('accept_deal');
  assert.ok(Array.isArray(kb) && kb.length === 1, 'accept_deal keeps its keyboard');
  assert.equal(kb[0][0].web_app.url, 'https://app.example.test/');
  assert.deepEqual(resolvedKeyboard('reject_deal'), kb);
});

test('editMessageText with no buttons sends no reply_markup', async () => {
  const realFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  };
  try {
    await editMessageText(1, 2, 'x', resolvedKeyboard('approve_user'));
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(bodies.length, 1, 'the edit must actually reach fetch');
  for (const b of bodies) assert.equal('reply_markup' in b, false);
});
