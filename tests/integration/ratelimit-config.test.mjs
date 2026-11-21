// Rate-limit env values are clamped to >= 1: 0 or negative would block every request.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.RATE_LIMIT_WINDOW_SECONDS = '0';
process.env.RATE_LIMIT_API_IP_MAX = '-5';
process.env.RATE_LIMIT_API_USER_MAX = '0';
process.env.RATE_LIMIT_WEBHOOK_MAX = '-1';

const { config } = await import('../../dist/config.js');

test('rate-limit values are clamped to at least 1', () => {
  assert.equal(config.rateLimitWindowMs, 1000);
  assert.equal(config.rateLimitApiIpMax, 1);
  assert.equal(config.rateLimitApiUserMax, 1);
  assert.equal(config.rateLimitWebhookMax, 1);
});

test('TRUST_CF_CONNECTING_IP only enables on the literal "true"', async () => {
  assert.equal(config.trustCfConnectingIp, false);
});
