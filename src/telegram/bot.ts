import { config } from '../config.js';

interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

/**
 * Fire-and-forget Telegram notification. Never throws into the request path — a
 * failed notification must not roll back a committed transaction. Optional inline
 * keyboard (array of button rows). Reusable base primitive (mirrors mctl-loyalty).
 */
export async function notify(
  telegramId: number | string,
  text: string,
  buttons?: InlineButton[][],
): Promise<void> {
  if (!config.telegramBotToken) return;
  try {
    const body: Record<string, unknown> = { chat_id: telegramId, text, parse_mode: 'HTML' };
    if (buttons?.length) body.reply_markup = { inline_keyboard: buttons };
    const res = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn('[bot] sendMessage non-200', res.status, await res.text().catch(() => ''));
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[bot] sendMessage failed', (err as Error).message);
  }
}
