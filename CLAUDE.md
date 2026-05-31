# mctl-pairdesk

**PairDesk** — a *closed* Telegram Mini App + bot where vetted community members
post and match **P2P exchange requests** (EUR/RUB/USDT). It is a **bulletin board,
NOT an exchange**: no custody, no payments, no escrow, never a party to a deal.

Node/TS + Express + PostgreSQL, forked from the `mctl-loyalty` stack and deployed
to the mctl platform (`labs` tenant). Image: `ghcr.io/mctlhq/mctl-pairdesk`.

## What it does
- **Closed community**: new users land `pending`; an admin approves them. Super-admins
  (`SUPER_ADMIN_TELEGRAM_IDS`) are auto-approved with the `admin` role. Roles:
  `user` < `trusted_user` < `moderator` < `admin`.
- **Orders**: a maker posts what they want to RECEIVE (`want_asset`/`want_amount`) plus
  one or more `order_give_options` — the *alternative* assets they'll give, each with its
  own `max_rate` + `payment_methods` (RUB *or* USDT, never mixed). A per-option market
  **reference snapshot** (CBR-sourced) records rate deviation for the UI warning.
- **Deals**: `requested → accepted → reserved → completed`. A responder creates a
  `requested` deal (order stays `active`, multiple responders queue). The maker **accepts**
  one — the binding concurrency point (`FOR NO KEY UPDATE` on the order + partial unique
  index `uq_deals_winner`): order flips to `reserved`, the chosen deal to `accepted`,
  siblings auto-`rejected`. Completion flips order+deal to `completed`.
- **Sensitive data**: phone / contact / payment-account details are gated at the
  **serializer** (`src/services/serializers.ts`), never on a public order shape. They are
  revealed by `GET /deals/:id` only when the caller is the creator or chosen responder AND
  `deal ∈ {accepted,completed}` AND `order ∈ {reserved,completed}`.
- **Subscriptions**: saved order-book filters; matching + bot fan-out is Stage 4.
- **Audit**: `audit_log` covers key USER actions (order/deal lifecycle, contact reveals)
  and every admin action.

## Stack & layout
- `src/config.ts` — env config + supported `ASSETS`.
- `src/db/{pool,migrate,schema.sql}.ts` — pg pool (CNPG SSL), advisory-locked idempotent
  migration, `withTransaction` helper. Schema is `CREATE … IF NOT EXISTS` + idempotent ALTERs.
- `src/telegram/{initData,bot}.ts` — **reusable base primitives** (initData HMAC verify,
  fire-and-forget `notify`). Kept dependency-free for a future `@mctl/telegram-*` extraction.
- `src/middleware/{auth,errors}.ts` — `requireAuth` (initData → upsert user), `requireApproved`,
  `requireRole`; `AppError` + `sendAppError`.
- `src/services/{community,orders,deals,rates,audit,serializers}.ts` — domain logic.
- `src/routes/{me,orders,deals,subscriptions,rates,admin}.ts` — all mounted at `/api`.
- `web/` — React + Vite Mini App (Stage 3; builds to `public/`).

## Single-community MVP
Every tenant-scoped row carries `community_id`; exactly one community is seeded by slug
(`COMMUNITY_SLUG`, default `default`). Multi-community is deferred but needs no schema retrofit.

## Local dev
```bash
npm install && npm run build:api
DATABASE_URL=postgres://... DATABASE_SSL=false AUTH_DEV_BYPASS=true \
  SUPER_ADMIN_TELEGRAM_IDS=1000 PORT=8099 npm start
# impersonate a Telegram id with the X-Debug-User-Id header (AUTH_DEV_BYPASS only)
```

## Env
- `DATABASE_URL` — Postgres (CNPG requires SSL; `DATABASE_SSL=false` for local).
- `TELEGRAM_BOT_TOKEN` — BotFather token (initData verification + notifications).
- `SUPER_ADMIN_TELEGRAM_IDS` — comma-separated super-admin Telegram ids.
- `COMMUNITY_SLUG` / `COMMUNITY_NAME` — the single MVP community.
- `ORDER_TTL_SECONDS` (default 72h), `INITDATA_MAX_AGE_SECONDS` (default 24h),
  `PORT` (default 8080), `AUTH_DEV_BYPASS` (dev only; hard-off when `APP_ENV=production`).

## Conventions
- Conventional commits; semver tags **without** `v` prefix. No emoji. No `Co-Authored-By`.
- **Never commit to `main`** — feature branch → PR → CI green → merge commit (not squash).
- Secrets via Vault + base-service ExternalSecret; never hardcoded.
