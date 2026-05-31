export type Asset = 'EUR' | 'RUB' | 'USDT';
export const ASSETS: Asset[] = ['EUR', 'RUB', 'USDT'];
export const PAYMENT_METHODS = ['bank_transfer', 'cash', 'TRC20', 'ERC20', 'TON', 'other'] as const;

export type UserStatus = 'pending' | 'approved' | 'rejected' | 'blocked';
export type UserRole = 'user' | 'trusted_user' | 'moderator' | 'admin';

export interface Me {
  id: number;
  telegram_id: number;
  username: string | null;
  status: UserStatus;
  role: UserRole;
  super_admin: boolean;
  disclaimer_accepted: boolean;
  profile: {
    display_name: string | null;
    city: string | null;
    country: string | null;
    preferred_payment_methods: string[];
    phone: string | null;
    contact: string | null;
    rating_score: string;
    completed_deals_count: number;
  };
}

export interface GiveOption {
  id: number;
  asset: Asset;
  max_rate: string | null;
  payment_methods: string[];
  reference_rate: string | null;
  reference_source: string | null;
  delta_percent: string | null;
}

export interface Order {
  id: number;
  want_asset: Asset;
  want_amount: string;
  give_options: GiveOption[];
  location_country: string | null;
  location_city: string | null;
  comment: string | null;
  status: string;
  expires_at: string | null;
  created_by_user_id: number;
  maker: { username: string | null; display_name: string | null; rating_score: string | number | null; completed_deals_count: number | null } | null;
  created_at: string;
}

export interface Deal {
  id: number;
  order_id: number;
  status: string;
  order_status: string;
  creator_user_id: number;
  responder_user_id: number;
  created_at: string;
  contacts_revealed?: boolean;
  creator_contact?: { username: string | null; phone: string | null; contact: string | null };
  responder_contact?: { username: string | null; phone: string | null; contact: string | null };
  // present in the my-deals list shape
  want_asset?: Asset;
  want_amount?: string;
}

export interface Subscription {
  id: number;
  want_asset: Asset;
  give_assets: Asset[];
  min_amount: string | null;
  max_amount: string | null;
  max_rate: string | null;
  location_city: string | null;
  is_active: boolean;
}
