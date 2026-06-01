import { pool } from '../db/pool.js';
import { notify, openAppButton } from '../telegram/bot.js';

export interface MatchInput {
  orderId: number;
  communityId: number;
  creatorUserId: number;
  wantAsset: string;
  wantAmount: string;
  giveOptions: Array<{ asset: string; maxRate: string | null; paymentMethods: string[] }>;
  locationCity: string | null;
  locationCountry: string | null;
}

interface SubRow {
  telegram_id: number;
  give_assets: string[];
  min_amount: string | null;
  max_amount: string | null;
  max_rate: string | null;
  payment_methods: string[];
  location_country: string | null;
  location_city: string | null;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function matchesSub(sub: SubRow, input: MatchInput): boolean {
  const amount = Number.parseFloat(input.wantAmount);
  if (sub.min_amount != null && amount < Number.parseFloat(sub.min_amount)) return false;
  if (sub.max_amount != null && amount > Number.parseFloat(sub.max_amount)) return false;

  // Give-side filters: narrow to candidate options by asset (or all if no preference),
  // then apply max_rate and payment_methods gates.
  const candidates =
    sub.give_assets.length > 0
      ? input.giveOptions.filter((o) => sub.give_assets.includes(o.asset))
      : input.giveOptions;
  if (sub.give_assets.length > 0 && candidates.length === 0) return false;

  if (sub.max_rate != null || sub.payment_methods.length > 0) {
    const subRate = sub.max_rate != null ? Number.parseFloat(sub.max_rate) : null;
    const qualifying = candidates.filter((o) => {
      if (subRate != null && o.maxRate != null && Number.parseFloat(o.maxRate) > subRate) return false;
      if (sub.payment_methods.length > 0 && !o.paymentMethods.some((m) => sub.payment_methods.includes(m))) return false;
      return true;
    });
    if (qualifying.length === 0) return false;
  }

  // Location: skip filter when either side has no preference.
  if (sub.location_country && input.locationCountry) {
    if (!input.locationCountry.toLowerCase().includes(sub.location_country.toLowerCase())) return false;
  }
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
              s.give_assets, s.min_amount, s.max_amount, s.max_rate,
              s.payment_methods, s.location_country, s.location_city
         FROM subscriptions s
         JOIN users u ON u.id = s.user_id AND u.status = 'approved'
        WHERE s.community_id = $1 AND s.is_active = TRUE
          AND s.want_asset = $2 AND s.user_id <> $3`,
      [input.communityId, input.wantAsset, input.creatorUserId],
    );

    const matched = rows.filter((s) => matchesSub(s, input));
    if (matched.length === 0) return;

    const open = openAppButton('View order');
    // Escape user-supplied strings: location_city comes from the order maker and
    // is used in parse_mode HTML — unescaped < > & would break the Bot API call
    // or allow markup injection (same risk as the safeLabel pattern in moderation.ts).
    const text =
      `New request: <b>${esc(input.wantAmount)} ${esc(input.wantAsset)}</b>` +
      (input.locationCity ? ` · ${esc(input.locationCity)}` : '') +
      ' — matches your alert.';
    const buttons = open ? [[open]] : undefined;
    for (const sub of matched) void notify(sub.telegram_id, text, buttons);
    console.log(`[matching] order ${input.orderId}: notified ${matched.length} subscriber(s)`);
  } catch (err) {
    console.error('[matching] matchAndNotify failed', (err as Error).message);
  }
}
