import { config } from '../config.js';

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
  web_app?: { url: string };
}

/** Low-level Telegram Bot API call. Best-effort: logs and swallows failures so a
 * notification never throws into a request/transaction path. Returns the parsed
 * `result` on success, or null. */
async function tgApi<T = unknown>(method: string, body: Record<string, unknown>): Promise<T | null> {
  if (!config.telegramBotToken) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
    if (!res.ok || !json?.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[bot] ${method} failed`, res.status, json?.description ?? '');
      return null;
    }
    return json.result ?? null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[bot] ${method} error`, (err as Error).message);
    return null;
  }
}

/** Fire-and-forget notification with an optional inline keyboard (rows of buttons). */
export async function notify(
  telegramId: number | string,
  text: string,
  buttons?: InlineButton[][],
): Promise<void> {
  const body: Record<string, unknown> = { chat_id: telegramId, text, parse_mode: 'HTML' };
  if (buttons?.length) body.reply_markup = { inline_keyboard: buttons };
  await tgApi('sendMessage', body);
}

/** Acknowledge a callback query (stops the client's spinner; optional toast). */
export async function answerCallback(callbackQueryId: string, text?: string): Promise<void> {
  await tgApi('answerCallbackQuery', { callback_query_id: callbackQueryId, text });
}

/** Replace a message's text + keyboard (used to "resolve" an action prompt). */
export async function editMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
  buttons?: InlineButton[][],
): Promise<void> {
  const body: Record<string, unknown> = { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML' };
  if (buttons?.length) body.reply_markup = { inline_keyboard: buttons };
  await tgApi('editMessageText', body);
}

/** A web_app button that opens the Mini App, or null when MINI_APP_URL is unset. */
export function openAppButton(text = 'Open PairDesk'): InlineButton | null {
  return config.miniAppUrl ? { text, web_app: { url: config.miniAppUrl } } : null;
}

/** Register the webhook with Telegram (called on startup when configured). The
 * secret is mandatory: the webhook route fails closed without it, so registering
 * a secret-less webhook would just make every update 401. */
export async function setWebhook(): Promise<void> {
  if (!config.telegramBotToken || !config.webhookUrl) return;
  if (!config.webhookSecret) {
    // eslint-disable-next-line no-console
    console.warn('[bot] TELEGRAM_WEBHOOK_URL set but TELEGRAM_WEBHOOK_SECRET missing — webhook NOT registered (route fails closed)');
    return;
  }
  const ok = await tgApi('setWebhook', {
    url: config.webhookUrl,
    secret_token: config.webhookSecret,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false,
  });
  // eslint-disable-next-line no-console
  console.log(`[bot] setWebhook ${config.webhookUrl} -> ${ok ? 'ok' : 'failed'}`);
}
