// Serializers are the security boundary for sensitive data (req #6): contact /
// phone / payment account details are NEVER placed on a public order shape. They
// only appear on a deal shape, and only when the caller is entitled (see
// services/deals.ts → contact-reveal rules). UI-level hiding is not relied upon.

export interface GiveOptionRow {
  id: number;
  asset: string;
  max_rate: string | null;
  payment_methods: string[];
}

export interface OrderRow {
  id: number;
  created_by_user_id: number;
  want_asset: string;
  want_amount: string;
  location_country: string | null;
  location_city: string | null;
  comment: string | null;
  status: string;
  expires_at: string | null;
  reserved_by_user_id: number | null;
  created_at: string;
}

export interface PublicCounterparty {
  user_id: number;
  username: string | null;
  display_name: string | null;
  rating_score: string | number | null;
  completed_deals_count: number | null;
}

export interface RateSnapshotRow {
  order_give_option_id: number | null;
  base_asset: string;
  quote_asset: string;
  rate: string;
  source: string;
  delta_percent: string | null;
}

/** Public order-book shape. Contains no contact/phone/payment-account fields. */
export function serializeOrder(
  order: OrderRow,
  options: GiveOptionRow[],
  maker: PublicCounterparty | null,
  snapshots: RateSnapshotRow[] = [],
): Record<string, unknown> {
  const snapByOption = new Map<number, RateSnapshotRow>();
  for (const s of snapshots) {
    if (s.order_give_option_id != null) snapByOption.set(s.order_give_option_id, s);
  }
  return {
    id: order.id,
    want_asset: order.want_asset,
    want_amount: order.want_amount,
    give_options: options.map((o) => {
      const snap = snapByOption.get(o.id);
      return {
        id: o.id,
        asset: o.asset,
        max_rate: o.max_rate,
        payment_methods: o.payment_methods,
        reference_rate: snap ? snap.rate : null,
        reference_source: snap ? snap.source : null,
        delta_percent: snap ? snap.delta_percent : null,
      };
    }),
    location_country: order.location_country,
    location_city: order.location_city,
    comment: order.comment,
    status: order.status,
    expires_at: order.expires_at,
    created_by_user_id: order.created_by_user_id,
    maker: maker
      ? {
          username: maker.username,
          display_name: maker.display_name,
          rating_score: maker.rating_score,
          completed_deals_count: maker.completed_deals_count,
        }
      : null,
    created_at: order.created_at,
  };
}

export interface ContactInfo {
  username: string | null;
  phone: string | null;
  contact: string | null;
}
