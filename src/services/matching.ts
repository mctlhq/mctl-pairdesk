import { pool } from '../db/pool.js';
import { notify, openAppButton } from '../telegram/bot.js';

export interface MatchInput {
  orderId: number;
  communityId: number;
  creatorUserId: number;
  wantAsset: string;
  wantAmount: string;
  giveOptions: Array<{ asset: string; maxRate: string | null }>;
  locationCity: string | null;
}

interface SubRow {
  telegram_id: number;
  give_assets: string[];
  min_amount: string | null;
  max_amount: string | null;
  max_rate: string | null;
  location_city: string | null;
}

function matchesSub(sub: SubRow, input: MatchInput): boolean {
  const amount = Number.parseFloat(input.wantAmount);
  if (sub.min_amount != null && amount < Number.parseFloat(sub.min_amount)) return false;
  if (sub.max_amount != null && amount > Number.parseFloat(sub.max_amount)) return false;

  if (sub.give_assets.length > 0) {
    const qualifying = input.giveOptions.filter((o) => sub.give_assets.includes(o.asset));
    if (qualifying.length === 0) return false;
    if (sub.max_rate != null) {
      const subRate = Number.parseFloat(sub.max_rate);
      const rateOk = qualifying.some((o) => o.maxRate == null || Number.parseFloat(o.maxRate) <= subRate);
      if (!rateOk) return false;
    }
  }

  // Location: skip if either side has no city preference.
  if (sub.location_city && input.locationCity) {
    if (!input.locationCity.toLowerCase().includes(sub.location_city.toLowerCase())) return false;
  }
  return true;
}

/**
 * Fan-out subscription notifications when a new order is posted. Runs outside
 * the create transaction — best-effort: never throws, never blocks order creation.
 */
export async function matchAndNotify(input: MatchInput): Promise<void> {
  try {
    const { rows } = await pool.query<SubRow>(
      `SELECT u.telegram_id,
              s.give_assets, s.min_amount, s.max_amount, s.max_rate, s.location_city
         FROM subscriptions s
         JOIN users u ON u.id = s.user_id AND u.status = 'approved'
        WHERE s.community_id = $1 AND s.is_active = TRUE
          AND s.want_asset = $2 AND s.user_id <> $3`,
      [input.communityId, input.wantAsset, input.creatorUserId],
    );

    const matched = rows.filter((s) => matchesSub(s, input));
    if (matched.length === 0) return;

    const open = openAppButton('View order');
    const text =
      `New request: <b>${input.wantAmount} ${input.wantAsset}</b>` +
      (input.locationCity ? ` · ${input.locationCity}` : '') +
      ' — matches your alert.';
    const buttons = open ? [[open]] : undefined;
    for (const sub of matched) void notify(sub.telegram_id, text, buttons);
    console.log(`[matching] order ${input.orderId}: notified ${matched.length} subscriber(s)`);
  } catch (err) {
    console.error('[matching] matchAndNotify failed', (err as Error).message);
  }
}
