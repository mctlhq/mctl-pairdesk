# Contributing to PairDesk

Thank you for your interest in contributing to PairDesk.

PairDesk is a **closed P2P exchange-request board** (a bulletin board, **not** an
exchange): no custody, no payments, no escrow, never a party to a deal. Please keep
that scope in mind when proposing changes.

## Prerequisites

- **Node.js** v22+
- **npm** (the repo uses `package-lock.json`)
- **PostgreSQL** for the API (CNPG requires SSL; local dev can disable it)
- **Git**

## Local development

```bash
npm install
npm run build:api          # compile the API (tsc) + copy schema.sql

# run the API against a local Postgres, impersonating a Telegram id:
DATABASE_URL=postgres://postgres:<password>@localhost:5432/pairdesk DATABASE_SSL=false \
  AUTH_DEV_BYPASS=true SUPER_ADMIN_TELEGRAM_IDS=1000 PORT=8099 npm start
# then send requests with the X-Debug-User-Id header (AUTH_DEV_BYPASS only)

npm run type-check         # tsc --noEmit (API)
npm run build:web          # build the React + Vite Mini App (web/)
npm run build              # full build (web + api)
```

## Branch strategy

- `main` is always deployable. **Never commit directly to `main`.**
- Feature branches: `feat/description`, `fix/description`, `chore/…`, `docs/…`, `ci/…`.
- Merge commits, no squash — `gh pr merge <N> --merge --delete-branch`.

## Commit conventions

Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`,
`ci:`. Subject line under 72 characters; the body explains *why*, not *what*.
No emoji. No `Co-Authored-By` trailers.

## Versioning

Semantic versioning, tags **without** a `v` prefix (`0.9.2`, not `v0.9.2`). The
Docker image (`ghcr.io/mctlhq/mctl-pairdesk`) shares the same `X.Y.Z`.

## Things to be careful about

- **Concurrency** — the order-reservation accept flow must stay race-safe
  (`FOR NO KEY UPDATE` on the order + the `uq_deals_winner` partial unique index).
- **Sensitive data** — phone / contact / payment-account fields must never appear
  on a public order shape; they are gated in `src/services/serializers.ts`.
- **Closed-access integrity** — `pending`/`blocked` users must not reach
  approved-only routes; `community_id` scoping must not be bypassable.

## Pull requests

Non-trivial PRs are reviewed automatically (Claude). Address every P1/P2 finding
before merge; CI must be green.
