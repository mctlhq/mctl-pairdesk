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
  if (config.webhookSecret && req.header('x-telegram-bot-api-secret-token') !== config.webhookSecret) {
    res.sendStatus(401);
    return;
  }
  res.sendStatus(200);
  void handleUpdate(req.body as TgUpdate);
});
