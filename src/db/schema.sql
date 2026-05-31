-- mctl-pairdesk schema. Idempotent: safe to run on every startup.
-- Closed P2P exchange-request board. Bulletin board only: no custody, no payments,
-- no escrow. Every tenant-scoped row carries community_id (single-community MVP).

-- Closed communities. MVP seeds exactly one (see config.defaultCommunitySlug);
-- the column exists everywhere so multi-community can land without a retrofit.
CREATE TABLE IF NOT EXISTS communities (
  id          BIGSERIAL PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Members. status gates access (admin approval); role gates privilege. phone and
-- contact are SENSITIVE and must never be returned by public order serializers.
CREATE TABLE IF NOT EXISTS users (
  id                      BIGSERIAL PRIMARY KEY,
  community_id            BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  telegram_id             BIGINT NOT NULL,
  username                TEXT,
  first_name              TEXT,
  last_name               TEXT,
  phone                   TEXT,
  contact                 TEXT,   -- freeform reqs / handle, revealed only on a match
  status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','approved','rejected','blocked')),
  role                    TEXT NOT NULL DEFAULT 'user'
                            CHECK (role IN ('user','trusted_user','moderator','admin')),
  invited_by_user_id      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  disclaimer_accepted_at  TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at            TIMESTAMPTZ,
  UNIQUE (community_id, telegram_id)
);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(community_id, status);

-- Extended profile (1:1). preferred_payment_methods holds method *types* only
-- (e.g. bank_transfer, cash, TRC20) — never account numbers (those go in contact).
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id                   BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name              TEXT,
  city                      TEXT,
  country                   TEXT,
  preferred_payment_methods TEXT[] NOT NULL DEFAULT '{}',
  rating_score              NUMERIC NOT NULL DEFAULT 0,
  completed_deals_count     INTEGER NOT NULL DEFAULT 0,
  disputes_count            INTEGER NOT NULL DEFAULT 0,
  is_verified               BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Invite codes. Joining is closed: a member shares a code, the invitee lands as
-- 'pending', an admin approves. max_uses/uses_count allow multi-use codes.
CREATE TABLE IF NOT EXISTS invites (
  id                  BIGSERIAL PRIMARY KEY,
  community_id        BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  code                TEXT NOT NULL UNIQUE,
  created_by_user_id  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  used_by_user_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','used','expired','revoked')),
  max_uses            INTEGER NOT NULL DEFAULT 1,
  uses_count          INTEGER NOT NULL DEFAULT 0,
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- An exchange request. want_asset/want_amount is what the maker wants to RECEIVE;
-- the assets they will give (alternatives, not mixed) live in order_give_options.
CREATE TABLE IF NOT EXISTS orders (
  id                   BIGSERIAL PRIMARY KEY,
  community_id         BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  created_by_user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  want_asset           TEXT NOT NULL,
  want_amount          NUMERIC NOT NULL CHECK (want_amount > 0),
  location_country     TEXT,
  location_city        TEXT,
  comment              TEXT,
  status               TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('draft','active','reserved','completed','cancelled','expired')),
  expires_at           TIMESTAMPTZ,
  reserved_by_user_id  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reserved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at         TIMESTAMPTZ,
  cancelled_at         TIMESTAMPTZ,
  deleted_at           TIMESTAMPTZ   -- soft delete
);
-- Order-book listing per pair, and the subscription fan-out hot path.
CREATE INDEX IF NOT EXISTS idx_orders_book ON orders(community_id, status, want_asset);
CREATE INDEX IF NOT EXISTS idx_orders_city ON orders(community_id, status, location_city);
-- Drives the expiry sweeper.
CREATE INDEX IF NOT EXISTS idx_orders_expiry ON orders(expires_at) WHERE status = 'active';

-- One row per settlement asset the maker is willing to give. Normalized (not JSONB)
-- because subscription matching filters on asset + max_rate from day one.
CREATE TABLE IF NOT EXISTS order_give_options (
  id               BIGSERIAL PRIMARY KEY,
  order_id         BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  asset            TEXT NOT NULL,
  max_rate         NUMERIC,   -- per-option: RUB and USDT cannot share one rate
  payment_methods  TEXT[] NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_give_options_order ON order_give_options(order_id);
CREATE INDEX IF NOT EXISTS idx_give_options_match ON order_give_options(asset, max_rate);

-- A market-reference snapshot taken per give-option at create/update time, so the
-- UI can warn on rate deviation (EUR/RUB ref for the RUB option, EUR/USDT for USDT).
CREATE TABLE IF NOT EXISTS reference_rate_snapshots (
  id                    BIGSERIAL PRIMARY KEY,
  order_id              BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  order_give_option_id  BIGINT REFERENCES order_give_options(id) ON DELETE CASCADE,
  base_asset            TEXT NOT NULL,
  quote_asset           TEXT NOT NULL,
  rate                  NUMERIC NOT NULL,
  source                TEXT NOT NULL,
  rate_timestamp        TIMESTAMPTZ,
  delta_percent         NUMERIC,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rate_snapshots_order ON reference_rate_snapshots(order_id);

-- A saved order-book filter: notify the subscriber when a matching order appears.
-- Matches an order when want_asset equals, amount is in range, some give option's
-- asset is in give_assets (and its max_rate clears this max_rate), and location fits.
CREATE TABLE IF NOT EXISTS subscriptions (
  id                BIGSERIAL PRIMARY KEY,
  community_id      BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  want_asset        TEXT NOT NULL,
  give_assets       TEXT[] NOT NULL DEFAULT '{}',
  min_amount        NUMERIC,
  max_amount        NUMERIC,
  max_rate          NUMERIC,
  location_country  TEXT,
  location_city     TEXT,
  payment_methods   TEXT[] NOT NULL DEFAULT '{}',
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_match
  ON subscriptions(community_id, is_active, want_asset);

-- A responder's interest in an order. Flow: requested -> accepted -> completed
-- (or rejected/cancelled). Multiple 'requested' deals may coexist on an 'active'
-- order; accept binds exactly one (see services/deals.ts) and the partial unique
-- index below is the DB-level backstop for "one winning deal per order".
CREATE TABLE IF NOT EXISTS deals (
  id                  BIGSERIAL PRIMARY KEY,
  community_id        BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  order_id            BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  creator_user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  responder_user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'requested'
                        CHECK (status IN ('requested','accepted','completed','cancelled','rejected')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_deals_order ON deals(order_id);
CREATE INDEX IF NOT EXISTS idx_deals_responder ON deals(responder_user_id, created_at DESC);
-- At most one winning (accepted/completed) deal per order — the accept-race backstop.
CREATE UNIQUE INDEX IF NOT EXISTS uq_deals_winner
  ON deals(order_id) WHERE status IN ('accepted','completed');
-- A responder may hold at most one open (requested/accepted) deal per order.
CREATE UNIQUE INDEX IF NOT EXISTS uq_deals_open_per_responder
  ON deals(order_id, responder_user_id) WHERE status IN ('requested','accepted');

-- Post-deal mutual feedback.
CREATE TABLE IF NOT EXISTS feedback (
  id           BIGSERIAL PRIMARY KEY,
  deal_id      BIGINT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  from_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL CHECK (status IN ('positive','neutral','negative')),
  rating       INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deal_id, from_user_id)
);

-- Audit trail. Covers key USER actions (order/deal lifecycle, contact reveals),
-- not just admin/moderator actions.
CREATE TABLE IF NOT EXISTS audit_log (
  id             BIGSERIAL PRIMARY KEY,
  community_id   BIGINT REFERENCES communities(id) ON DELETE SET NULL,
  actor_user_id  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action         TEXT NOT NULL,
  target_type    TEXT,
  target_id      BIGINT,
  meta           JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
