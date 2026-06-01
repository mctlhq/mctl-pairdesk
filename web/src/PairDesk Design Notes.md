# PairDesk — Mini App redesign notes (Direction C · Trust / Banking)

Companion to **PairDesk Prototype.html** (clickable, light + dark, Tweaks-driven) and
**pairdesk/pairdesk-tokens.css** (drop-in tokens mapped to `tg.themeParams`).

## Direction
Deep-blue, clean cards, calm and solid — "trust without coldness". Native Telegram
base (header / BackButton / MainButton / haptics, both themes) with a recognisable
PairDesk character: tabular numerals for money, currency glyph chips (€ ₽ ₮), and a
**rate-vs-market chip** that is the trust signal of the whole product.

## Token model
- Everything derives from `--tg-*` (set by `applyTheme()`), so theme switches are free.
- PairDesk adds what Telegram can't express: the **rate scale** (`good / fair / far`),
  card elevation, radii, the number font, and currency identity colors.
- Three knobs are meant to be live: **accent** (defaults to `--tg-button`),
  **density** (`data-density`), and **number font** (`--pd-num-font` → mono | inherit).

## Screen hierarchy
```
App
├─ Disclaimer gate (first run, blocks)
├─ Pending / Rejected / Blocked  (status wall)
└─ Shell
   ├─ TgHeader        brand | BackButton (pushed views) | ⋯ ✕
   ├─ Screen (scroll)
   │  ├─ OrderBook    h1 + count · ChipGroup×2 + city field · OrderCard list · Load more
   │  ├─ OrderDetail  hero amount · MakerCard(Trusted) · GiveOptions · Note · [responder|maker]
   │  ├─ CreateOrder  StepForm 1→2→3  (want → give options → note+preview)
   │  ├─ MyOrders     OrderCard list → maker detail
   │  ├─ Alerts       subscription form + list
   │  └─ Profile      identity · stats · contact-privacy note
   ├─ TabBar          Book · Create · Deals · Profile   (top-level only)
   └─ MainButton      primary CTA, native (Respond / Continue / Publish)
```

## Component patterns
- **OrderCard** — three variants (Tweak): `standard` (amount + best-rate chip + pays-in +
  maker), `compact` (dense row, glyph + badge + chevron — for trading-feed density),
  `rate` (each give option with its own rate chip; rate-forward). All share glyph,
  tabular amount, status `Badge`.
- **ChipGroup** — segmented filters/toggles. Selected = filled accent; `is-on` only.
  Used for asset filters, payment methods, alert assets.
- **RateChip** — `delta%` vs market reference with semantic color. States: `good` ≥ +2% (above market,
  green), `fair` ±, `far` ≤ −10% (far below market, amber — the "may be flagged" case).
  Three renderings (Tweak): `chip` (dot + word + %), `bar` (mini gauge), `badge` (compact %).
- **StepForm** — `Stepper` dots (active / done-check), one section per step in multi mode,
  all sections stacked in single-page mode. The Telegram **MainButton** is the only
  forward control: `Continue` (disabled until amount valid) → `Continue` → `Publish`.
  Single-page collapses to one `Publish`. Live market-reference `RatePreview` under each rate input.
- **StatusBadge** — pill, lowercase, semantic color from status (`active` green,
  `reserved/accepted` accent, `rejected/cancelled/expired` red, else neutral).
- **MakerCard / Maker** — avatar (initial) · name · ★ rating · deals count. `Trusted`
  shield reinforces the closed-community trust model.

## Interaction patterns
- **Native chrome**: BackButton on every pushed view (detail, create); MainButton for the
  primary action only; haptic `success`/`error` on respond / accept / publish.
- **Filters**: debounced, live result count, horizontal chip rows (no wrap, no clip),
  "Load more" cursor instead of pagination.
- **Respond flow** (responder): tap card → detail → MainButton *Respond* → optimistic
  "Response sent" pending card; contacts only ever revealed after the maker accepts.
- **Review flow** (maker): inline Accept / Reject per response; on Accept the contact card
  reveals (Telegram, phone) with the "settle directly, mark complete" note.
- **Create**: segmented asset selector, large amount field with inline glyph + code,
  rate input shows market reference + deviation chip in real time; step 3 renders a live
  `OrderCard` preview before Publish; on publish → maker detail with "published" banner.
- **States to build next**: skeleton rows for OrderBook load, empty states (done),
  optimistic toasts, and the remaining screens (Disclaimer, Pending, Admin) — all reuse
  the same atoms.

## Tweaks in the prototype
`view` (both/light/dark) · `accent` · `density` · `numbers` (mono/prop) ·
`order card` (standard/compact/rate) · `book layout` (flat/grouped) ·
`rate display` (chip/bar/badge) · `create flow` (multi/single).
