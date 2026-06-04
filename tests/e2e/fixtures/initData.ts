import { createHmac } from 'node:crypto';

export interface TestUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

/**
 * Build a VALID Telegram Mini App `initData` query string, signed with `botToken`.
 *
 * This is the exact inverse of the server's `verifyInitData` (src/telegram/initData.ts):
 *   secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)
 *   hash       = HMAC_SHA256(key=secret_key, msg=data_check_string)
 * where data_check_string is the `\n`-joined sorted "key=value" pairs (decoded values,
 * `hash` excluded). Because the harness signs with the SAME throwaway token the test
 * server boots with, this exercises the genuine HMAC verification path — no real secret.
 */
export function signInitData(
  user: TestUser,
  botToken: string,
  authDate: number = Math.floor(Date.now() / 1000),
): string {
  const params = new URLSearchParams();
  params.set('user', JSON.stringify(user));
  params.set('auth_date', String(authDate));
  params.set('query_id', `test-${user.id}-${authDate}`);

  // URLSearchParams.entries() yields DECODED values — matches the server, which
  // builds the data-check-string from decoded entries after `new URLSearchParams()`.
  const dataCheckString = [...params.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  params.set('hash', hash);
  return params.toString();
}
