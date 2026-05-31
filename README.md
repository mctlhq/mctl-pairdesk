# PairDesk

A **closed Telegram Mini App + bot** where vetted community members post and match
**P2P exchange requests** (EUR / RUB / USDT).

PairDesk is a **bulletin board, not an exchange**. It does not custody funds, process
payments, provide financial services, guarantee rates, or act as a party to any
transaction. All arrangements and settlement happen directly between members, at their
own risk.

## Safety model & invariants

These hold by design and must not regress:

- **Bulletin board only — no custody, no payments, no escrow.** PairDesk never moves money,
  holds balances, or settles anything. It records intent and connects counterparties.
- **Contact reveal is enforced by backend serializers, not frontend hiding.** Phone, contact
  and payment-account fields never appear in any public order / order-book payload
  (`src/services/serializers.ts`). They are returned only by `GET /deals/:id`, only to the
  creator or chosen responder, and only when the deal is accepted/completed AND the order is
  reserved/completed (`src/services/deals.ts`).
- **The accept flow is concurrency-protected.** Accepting a responder locks the order row with
  `SELECT … FOR NO KEY UPDATE`, re-checks it is still `active`, then reserves it — and the
  partial unique index `uq_deals_winner` (`deals(order_id) WHERE status IN ('accepted','completed')`)
  is the DB-level backstop guaranteeing at most one winning deal per order. Two racing accepts
  cannot both win.

## Status

- **Stage 1 (backend skeleton + schema)** — done. Closed-community auth (Telegram
  initData), orders with give-option alternatives, transactional deal flow
  (`requested → accepted → reserved → completed`) with an accept-time lock, per-option
  reference-rate snapshots, serializer-level sensitive-data gating, subscriptions,
  admin moderation, and an audit log. Verified end-to-end against Postgres.
- Stage 2 — Telegram bot (`/start` gate, approve/respond inline buttons, notifications).
- Stage 3 — React + Vite Mini App UI.
- Stage 4–5 — subscription matching + notifications, then hardening.

See `CLAUDE.md` for architecture and local-dev instructions.

## Quick start

```bash
npm install && npm run build:api
DATABASE_URL=postgres://postgres:pd@localhost:5432/pairdesk DATABASE_SSL=false \
  AUTH_DEV_BYPASS=true SUPER_ADMIN_TELEGRAM_IDS=1000 PORT=8099 npm start
```

In dev (`AUTH_DEV_BYPASS=true`), impersonate a Telegram id with the `X-Debug-User-Id`
header instead of real Mini App initData.

## License

Apache-2.0.
