import { getDefaultCommunityId } from '../services/community.js';
import { acceptDeal, rejectDeal } from '../services/deals.js';
import { getUserStatus, notifyAdminsOfNewUser, setUserStatus } from '../services/moderation.js';
import { upsertTelegramUser } from '../services/users.js';
import { AppError } from '../middleware/errors.js';
import { answerCallback, editMessageText, type InlineButton, notify, openAppButton } from './bot.js';
import { buildBotContext } from './context.js';

interface TgUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}
interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: { id: number };
  text?: string;
}
interface TgCallbackQuery {
  id: string;
  from: TgUser;
  data?: string;
  message?: TgMessage;
}
export interface TgUpdate {
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

/** Entry point for a single Telegram update. Never throws — logs and swallows. */
export async function handleUpdate(update: TgUpdate): Promise<void> {
  try {
    if (update.message) await handleMessage(update.message);
    else if (update.callback_query) await handleCallback(update.callback_query);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[webhook] handler error', (err as Error).message);
  }
}

const PENDING_MSG = 'Your request to join PairDesk has been sent to an admin. You will get a message here once approved.';

async function handleMessage(msg: TgMessage): Promise<void> {
  const from = msg.from;
  if (!from) return;
  const text = (msg.text ?? '').trim();
  const chatId = msg.chat.id;

  if (text.startsWith('/start') || text.startsWith('/app')) {
    const communityId = await getDefaultCommunityId();
    const u = await upsertTelegramUser(communityId, from);
    if (u.inserted && u.status === 'pending') {
      void notifyAdminsOfNewUser(communityId, u.id, from.username ? `@${from.username}` : `id ${from.id}`);
    }
    if (u.status === 'approved') {
      const open = openAppButton('Open PairDesk');
      await notify(
        chatId,
        'Welcome to PairDesk — your private P2P exchange-request board. Open the app to browse and post requests.',
        open ? [[open]] : undefined,
      );
    } else if (u.status === 'blocked') {
      await notify(chatId, 'Your access to PairDesk is blocked.');
    } else if (u.status === 'rejected') {
      await notify(chatId, 'Your request to join PairDesk was not approved.');
    } else {
      await notify(chatId, PENDING_MSG);
    }
    return;
  }

  if (text.startsWith('/help')) {
    await notify(
      chatId,
      'PairDesk is a private bulletin board for P2P exchange requests — no custody, no payments, not a party to any deal.\n\n/start — open the app or check your status\n/help — this message',
    );
    return;
  }
}

async function handleCallback(cq: TgCallbackQuery): Promise<void> {
  const data = cq.data ?? '';
  const sep = data.indexOf(':');
  if (sep === -1) {
    await answerCallback(cq.id);
    return;
  }
  const action = data.slice(0, sep);
  const targetId = Number.parseInt(data.slice(sep + 1), 10);
  const chatId = cq.message?.chat.id;
  const messageId = cq.message?.message_id;

  const ctx = await buildBotContext(cq.from.id);
  if (!ctx) {
    await answerCallback(cq.id, 'Unknown user — open the app first.');
    return;
  }
  // Parity with the Mini App's requireApproved(): a pending/blocked/rejected user
  // must not act via the bot, even if they retain a stale moderator role. (Super-
  // admins are force-approved by the upsert, so the env escape hatch survives.)
  if (ctx.status !== 'approved') {
    await answerCallback(cq.id, 'Not available.');
    return;
  }

  // Idempotency for join-request buttons: the same Approve/Reject keyboard is fanned
  // out to every moderator, so one admin can hold a stale copy after another already
  // acted. Reject the stale click rather than letting an unconditional status UPDATE
  // undo a prior decision (mirrors the deal path's "already handled" guard).
  if (action === 'approve_user' || action === 'reject_user') {
    const cur = await getUserStatus(ctx.communityId, targetId);
    if (cur === null) {
      await answerCallback(cq.id, 'User not found');
      return;
    }
    if (cur !== 'pending') {
      await answerCallback(cq.id, 'Already handled');
      if (chatId != null && messageId != null) {
        await editMessageText(chatId, messageId, `Already handled — member is ${cur}.`);
      }
      return;
    }
  }

  try {
    let toast = '';
    let resolved = '';
    switch (action) {
      case 'approve_user': {
        await setUserStatus(ctx, targetId, 'approved', 'You have been approved for PairDesk. Open the app to start.', 'pending');
        toast = 'Approved';
        resolved = `✅ Approved member #${targetId}.`;
        break;
      }
      case 'reject_user': {
        await setUserStatus(ctx, targetId, 'rejected', undefined, 'pending');
        toast = 'Rejected';
        resolved = `🚫 Rejected member #${targetId}.`;
        break;
      }
      case 'accept_deal': {
        await acceptDeal(ctx, targetId);
        toast = 'Accepted';
        resolved = `✅ You accepted a response. Contact details are now shared in the app.`;
        break;
      }
      case 'reject_deal': {
        await rejectDeal(ctx, targetId);
        toast = 'Rejected';
        resolved = `Response declined.`;
        break;
      }
      default:
        await answerCallback(cq.id);
        return;
    }
    await answerCallback(cq.id, toast);
    if (chatId != null && messageId != null) {
      const open = openAppButton();
      const buttons: InlineButton[][] | undefined = open ? [[open]] : undefined;
      await editMessageText(chatId, messageId, resolved, buttons);
    }
  } catch (err) {
    const msg = err instanceof AppError ? err.message : 'Action failed';
    await answerCallback(cq.id, msg);
  }
}
