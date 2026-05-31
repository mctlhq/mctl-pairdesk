import { Router } from 'express';
import { config } from '../config.js';
import { handleUpdate, type TgUpdate } from '../telegram/webhook.js';

export const webhookRouter = Router();

// Telegram pushes updates here. Authenticated by the secret token Telegram
// echoes in the X-Telegram-Bot-Api-Secret-Token header (set via setWebhook) —
// NOT by Mini App initData, so this route lives outside the /api auth chain.
// Responds 200 immediately and processes the update out of band (the handler
// never throws), so a slow Bot API call can't make Telegram retry.
webhookRouter.post('/telegram/webhook', (req, res) => {
  // Fail closed. Without a configured secret we cannot authenticate Telegram, so
  // we must reject everything — otherwise anyone could POST a spoofed update and,
  // via /start with a super-admin Telegram id (the allowlist is not a secret),
  // self-promote to an approved admin. Never process unauthenticated updates.
  if (!config.webhookSecret || req.header('x-telegram-bot-api-secret-token') !== config.webhookSecret) {
    res.sendStatus(401);
    return;
  }
  const body = req.body as unknown;
  if (!body || typeof body !== 'object') {
    res.sendStatus(400);
    return;
  }
  res.sendStatus(200);
  void handleUpdate(body as TgUpdate);
});
