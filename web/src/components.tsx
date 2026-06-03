import { ASSETS, type Asset, type GiveOption, type Order } from './types.js';

// ---- SVG icon paths --------------------------------------------------------
export const PD_ICON: Record<string, string> = {
  book:      'M4 5.5A1.5 1.5 0 0 1 5.5 4H19a1 1 0 0 1 1 1v13.5a1.5 1.5 0 0 1-1.5 1.5H6a2 2 0 0 1-2-2zM8 8h8M8 11.5h8M8 15h5',
  create:    'M12 5v14M5 12h14',
  orders:    'M8 4h6l4 4v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM14 4v4h4M9.5 13h5M9.5 16h3',
  bell:      'M6.5 17V11a5.5 5.5 0 0 1 11 0v6M4.5 17h15M10 20.5a2 2 0 0 0 4 0',
  user:      'M12 12.5a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5zM5 19.5a7 7 0 0 1 14 0',
  back:      'M14.5 6 9 12l5.5 6',
  chevron:   'M9 6l6 6-6 6',
  star:      'M12 4.5l2.06 4.36 4.69.6-3.46 3.2.9 4.66L12 15.9 7.81 17.32l.9-4.66-3.46-3.2 4.69-.6z',
  shield:    'M12 4l6.5 2.2v5c0 4-2.8 6.7-6.5 8.3-3.7-1.6-6.5-4.3-6.5-8.3v-5z',
  pin:       'M12 21c4-4 6.5-7 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 14 8 17 12 21zM12 12.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  clock:     'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  close:     'M6 6l12 12M18 6 6 18',
  check:     'M5 12.5 10 17l9-10',
  dots:      'M6 12h.01M12 12h.01M18 12h.01',
  filter:    'M4 6h16M7 12h10M10 18h4',
  plus:      'M12 6v12M6 12h12',
  arrowSwap: 'M7 7h11l-3-3M17 17H6l3 3',
};

export const PD_GLYPH: Record<string, string> = { EUR: '€', RUB: '₽', USDT: '₮' };

export const PD_METHOD_LABEL: Record<string, string> = {
  bank_transfer: 'Bank',
  cash: 'Cash',
  wirex: 'Wirex',
  wise: 'Wise',
  TRC20: 'TRC20',
  ERC20: 'ERC20',
  TON: 'TON',
  other: 'Other',
};

// ---- Rate state ------------------------------------------------------------
export function pdRateState(d: number | null): { key: 'good' | 'fair' | 'far' | 'none'; label: string } {
  if (d == null || !Number.isFinite(d)) return { key: 'none', label: '' };
  if (d >= 2)   return { key: 'good', label: 'Good' };
  if (d <= -10) return { key: 'far',  label: 'Far'  };
  return { key: 'fair', label: 'Fair' };
}

// ---- Icon ------------------------------------------------------------------
interface IconProps {
  name: string;
  size?: number;
  stroke?: number;
  fill?: boolean;
  cls?: string;
}
export function Icon({ name, size = 22, stroke = 1.7, fill = false, cls = '' }: IconProps) {
  const d = PD_ICON[name];
  if (!d) return null;
  const fillStar = fill && (name === 'star' || name === 'shield');
  return (
    <svg
      className={`pd-ic${cls ? ` ${cls}` : ''}`}
      width={size} height={size}
      viewBox="0 0 24 24"
      fill={fillStar ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

// ---- Currency glyph --------------------------------------------------------
export function Glyph({ asset, size = 'md' }: { asset: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`pd-glyph pd-glyph-${asset} pd-glyph-${size}`} aria-hidden="true">
      {PD_GLYPH[asset] ?? asset[0]}
    </span>
  );
}

export function AssetTag({ asset }: { asset: string }) {
  return (
    <span className="pd-asset">
      <Glyph asset={asset} size="sm" />
      <span className="pd-asset-code">{asset}</span>
    </span>
  );
}

// ---- Status badge ----------------------------------------------------------
export function Badge({ status }: { status: string }) {
  return <span className={`pd-badge pd-badge-${status}`} aria-label={`Status: ${status}`}>{status}</span>;
}

// ---- Rate chip -------------------------------------------------------------
export type RateStyle = 'chip' | 'bar' | 'badge';

export function RateChip({
  delta,
  style = 'chip',
  compact = false,
}: {
  delta: string | number | null | undefined;
  style?: RateStyle;
  compact?: boolean;
}) {
  const raw = delta == null ? null : Number.parseFloat(String(delta));
  const d = raw != null && Number.isFinite(raw) ? raw : null;
  const st = pdRateState(d);
  if (st.key === 'none') {
    if (compact) return null;
    return <span className="pd-rate-none">no rate</span>;
  }
  const sign = d! > 0 ? '+' : '';
  const pct = `${sign}${d!.toFixed(1)}%`;

  if (style === 'bar') {
    const w = Math.max(0, Math.min(100, 50 + d! * 2.5));
    return (
      <span className={`pd-ratebar pd-rate-${st.key}`}>
        <span className="pd-ratebar-fill" style={{ width: `${w}%` }} />
        <span className="pd-ratebar-label pd-num">{pct} vs Market ref.</span>
      </span>
    );
  }
  if (style === 'badge') {
    return (
      <span className={`pd-ratebadge pd-rate-${st.key}`}>
        <span className="pd-num">{pct}</span>
      </span>
    );
  }
  return (
    <span className={`pd-ratechip pd-rate-${st.key}`} aria-label={`Market reference: ${st.label}, ${pct}`}>
      <span className="pd-ratedot" />
      {!compact && <span className="pd-rate-word">{st.label}</span>}
      <span className="pd-num pd-rate-pct">{pct}</span>
    </span>
  );
}

// ---- Maker -----------------------------------------------------------------
interface MakerData {
  display_name: string | null;
  username: string | null;
  rating_score?: string | number | null;
  completed_deals_count?: number | null;
}

export function Maker({ maker, sub }: { maker: MakerData | null; sub?: React.ReactNode }) {
  if (!maker) return null;
  const name = maker.display_name || (maker.username ? `@${maker.username}` : 'member');
  const initial = (maker.display_name || maker.username || 'M').slice(0, 1).toUpperCase();
  return (
    <div className="pd-maker">
      <span className="pd-avatar">{initial}</span>
      <span className="pd-maker-meta">
        <span className="pd-maker-name">{name}</span>
        <span className="pd-maker-sub">
          <Icon name="star" size={12} fill cls="pd-star" />
          <span className="pd-num">{maker.rating_score ?? '—'}</span>
          <span className="pd-dot-sep">·</span>
          <span className="pd-num">{maker.completed_deals_count ?? 0}</span>&nbsp;deals
          {sub ? <><span className="pd-dot-sep">·</span>{sub}</> : null}
        </span>
      </span>
    </div>
  );
}

// ---- Give row --------------------------------------------------------------
export function GiveRow({
  g,
  base,
  wantAmount,
  rateStyle = 'chip',
  showMethods = true,
}: {
  g: GiveOption;
  base: string;
  wantAmount?: string | null;
  rateStyle?: RateStyle;
  showMethods?: boolean;
}) {
  const total = (() => {
    if (!g.max_rate || !wantAmount) return null;
    const qty = Number.parseFloat(wantAmount);
    const rate = Number.parseFloat(g.max_rate);
    if (!Number.isFinite(qty) || !Number.isFinite(rate)) return null;
    return qty * rate;
  })();

  return (
    <div className="pd-give">
      <div className="pd-give-grid">
        <span className="pd-field-label">Will give</span>
        <span className="pd-field-value"><AssetTag asset={g.asset} /></span>
        <span className="pd-field-label">Rate</span>
        <span className="pd-field-value pd-num">
          {g.max_rate ? `${fmtAmount(g.max_rate)} ${g.asset}/${base}` : 'Not set'}
        </span>
        <span className="pd-field-label">Total</span>
        <span className="pd-field-value pd-num">
          {total != null ? `${fmtAmount(total)} ${g.asset}` : '—'}
        </span>
        <span className="pd-field-label">Market ref.</span>
        <span className="pd-field-value"><RateChip delta={g.delta_percent} style={rateStyle} /></span>
      </div>
      {showMethods && (
        <div className="pd-methods">
          {g.payment_methods.map((m) => (
            <span className="pd-method" key={m}>{PD_METHOD_LABEL[m] ?? m}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Amount formatter ------------------------------------------------------
export function fmtAmount(s: string | number | null | undefined): string {
  if (s == null) return '—';
  const n = typeof s === 'number' ? s : Number.parseFloat(s);
  if (!Number.isFinite(n)) return String(s);
  return n.toLocaleString('en-US', { maximumFractionDigits: 8 });
}

// ---- OrderCard (4 variants) ------------------------------------------------
type OrderCardVariant = 'standard' | 'compact' | 'rate' | 'outcome';

function bestDelta(order: Order): string | null {
  const ds = order.give_options
    .map((g) => (g.delta_percent == null ? null : Number.parseFloat(g.delta_percent)))
    .filter((x): x is number => x != null);
  if (!ds.length) return null;
  return String(Math.max(...ds));
}

export function OrderCard({
  order,
  onOpen,
  variant = 'standard',
  rateStyle = 'chip',
  highlightAsset,
}: {
  order: Order;
  onOpen?: (id: number) => void;
  variant?: OrderCardVariant;
  rateStyle?: RateStyle;
  // When the book is filtered by Offers, headline the give option the user
  // filtered for instead of give_options[0] — otherwise the card shows a
  // non-matching asset and hides the amount/rate that produced the match.
  highlightAsset?: Asset;
}) {
  const tap = onOpen ? () => onOpen(order.id) : undefined;

  if (variant === 'outcome') {
    const qty = Number.parseFloat(order.want_amount);
    const primary = (highlightAsset && order.give_options.find((g) => g.asset === highlightAsset))
      ?? order.give_options[0] ?? null;
    const primaryRate = primary?.max_rate ? Number.parseFloat(primary.max_rate) : null;
    const primaryTotal = primary && primaryRate != null && Number.isFinite(qty) && Number.isFinite(primaryRate) ? qty * primaryRate : null;
    // The card pairs Rate + Market-ref with give_options[0]. When another option
    // has a strictly better deviation, surface it so the spread isn't hidden
    // (the responder would otherwise only see it after tapping into the detail).
    const primaryDelta = primary?.delta_percent != null ? Number.parseFloat(primary.delta_percent) : null;
    const best = bestDelta(order);
    const bestNum = best != null ? Number.parseFloat(best) : null;
    const showBest = order.give_options.length > 1 && bestNum != null && (primaryDelta == null || bestNum > primaryDelta);
    return (
      <button className="pd-card pd-card-outcome" onClick={tap}>
        <div className="pd-order-summary">
          <div className="pd-order-line">
            <span className="pd-order-label">Wants</span>
            <span className="pd-order-value">
              <Glyph asset={order.want_asset} size="sm" />
              <span className="pd-num">{fmtAmount(order.want_amount)}</span>
              <span>{order.want_asset}</span>
            </span>
          </div>
          <div className="pd-order-line pd-order-line-strong">
            <span className="pd-order-label">Offers</span>
            <span className="pd-order-value">
              {primary ? (
                <>
                  <Glyph asset={primary.asset} size="md" />
                  <span className="pd-num">{primaryTotal != null ? fmtAmount(primaryTotal) : '—'}</span>
                  <span>{primary.asset}</span>
                  {order.give_options.length > 1 && <span className="pd-order-alt">+{order.give_options.length - 1} option</span>}
                </>
              ) : '—'}
            </span>
          </div>
          <div className="pd-order-line">
            <span className="pd-order-label">Rate</span>
            <span className="pd-order-value pd-num">
              {primary?.max_rate ? (
                <>
                  {`${fmtAmount(primary.max_rate)} ${primary.asset}/${order.want_asset}`}
                  <RateChip delta={primary.delta_percent} style="chip" />
                  {showBest && <span className="pd-order-alt">best {bestNum! > 0 ? '+' : ''}{bestNum!.toFixed(1)}%</span>}
                </>
              ) : 'Not set'}
            </span>
          </div>
        </div>
        <div className="pd-card-divider" />
        <div className="pd-row pd-card-foot">
          <Maker
            maker={order.maker}
            sub={order.location_city ? (
              <><Icon name="pin" size={12} cls="pd-mut-ic" />{order.location_city}</>
            ) : undefined}
          />
          <span className="pd-spacer" />
          <span className="pd-when pd-num">{fmtRelTime(order.created_at)}</span>
        </div>
      </button>
    );
  }

  if (variant === 'compact') {
    return (
      <button className="pd-card pd-card-compact" onClick={tap}>
        <Glyph asset={order.want_asset} size="md" />
        <span className="pd-cc-main">
          <span className="pd-cc-amt">
            <span className="pd-num">{fmtAmount(order.want_amount)}</span>{' '}{order.want_asset}
          </span>
          <span className="pd-cc-sub">
            <Icon name="pin" size={12} cls="pd-mut-ic" />
            {order.location_city ?? '—'}
            <span className="pd-dot-sep">·</span>
            pays {order.give_options.map((g) => g.asset).join(' / ')}
          </span>
        </span>
        <span className="pd-cc-right">
          <RateChip delta={bestDelta(order)} style="badge" />
          <Icon name="chevron" size={16} cls="pd-chev" />
        </span>
      </button>
    );
  }

  if (variant === 'rate') {
    return (
      <button className="pd-card pd-card-rate" onClick={tap}>
        <div className="pd-row pd-card-top">
          <span className="pd-want">
            <Glyph asset={order.want_asset} size="md" />
            <span className="pd-want-amt pd-num">{fmtAmount(order.want_amount)}</span>
            <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--pd-text-2)' }}>{order.want_asset}</span>
          </span>
          <span className="pd-spacer" />
          <Badge status={order.status} />
        </div>
        <div className="pd-card-gives">
          {order.give_options.map((g) => {
            const qty = Number.parseFloat(order.want_amount);
            const rate = g.max_rate ? Number.parseFloat(g.max_rate) : null;
            const total = rate && Number.isFinite(qty) && Number.isFinite(rate) ? qty * rate : null;
            return (
              <div key={g.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 6, borderBottom: '1px solid var(--pd-border)', marginBottom: 6 }}>
                <div className="pd-cr-give">
                  <AssetTag asset={g.asset} />
                  {g.max_rate ? (
                    <span className="pd-cr-rate pd-num">
                      {fmtAmount(g.max_rate)}
                      <span className="pd-give-unit"> {g.asset}/{order.want_asset}</span>
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--pd-hint)' }}>rate not set</span>
                  )}
                  <span className="pd-spacer" />
                  <RateChip delta={g.delta_percent} style={rateStyle} compact />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  {total != null && (
                    <span style={{ color: 'var(--pd-text-2)', fontWeight: 700 }}>
                      = <span className="pd-num">{fmtAmount(total)}</span> {g.asset}
                    </span>
                  )}
                  {g.payment_methods.length > 0 && (
                    <span style={{ color: 'var(--pd-hint)', display: 'flex', gap: 4 }}>
                      {g.payment_methods.map((m) => (
                        <span className="pd-method" key={m}>{PD_METHOD_LABEL[m] ?? m}</span>
                      ))}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="pd-row pd-card-foot">
          <Maker
            maker={order.maker}
            sub={
              order.location_city ? (
                <><Icon name="pin" size={12} cls="pd-mut-ic" />{order.location_city}</>
              ) : undefined
            }
          />
          <span className="pd-spacer" />
          <span className="pd-when pd-num">{fmtRelTime(order.created_at)}</span>
        </div>
      </button>
    );
  }

  // standard (default)
  return (
    <button className="pd-card pd-card-standard" onClick={tap}>
      <div className="pd-row pd-card-top">
        <span className="pd-want">
          <Glyph asset={order.want_asset} size="md" />
          <span className="pd-want-amt pd-num">{fmtAmount(order.want_amount)}</span>
        </span>
        <span className="pd-spacer" />
        <RateChip delta={bestDelta(order)} style="chip" compact />
      </div>
      <div className="pd-card-line">
        <span className="pd-pays-label">pays in</span>
        {order.give_options.map((g) => (
          <span className="pd-pays-asset" key={g.id}>
            <Glyph asset={g.asset} size="sm" />{g.asset}
          </span>
        ))}
        <span className="pd-spacer" />
        {order.location_city && (
          <span className="pd-loc">
            <Icon name="pin" size={13} cls="pd-mut-ic" />{order.location_city}
          </span>
        )}
      </div>
      <div className="pd-card-divider" />
      <div className="pd-row pd-card-foot">
        <Maker maker={order.maker} />
        <span className="pd-spacer" />
        <span className="pd-when pd-num">{fmtRelTime(order.created_at)}</span>
      </div>
    </button>
  );
}

// ---- Empty state -----------------------------------------------------------
export function Empty({ text }: { text: string }) {
  return (
    <div className="pd-empty">
      <div className="pd-empty-mark">
        <Icon name="filter" size={26} />
      </div>
      <p className="pd-empty-title">Nothing here</p>
      <p className="pd-empty-sub">{text}</p>
    </div>
  );
}

// ---- Asset selector --------------------------------------------------------
export function AssetSelect({
  value,
  onChange,
  exclude = [],
}: {
  value: Asset;
  onChange: (a: Asset) => void;
  exclude?: Asset[];
}) {
  return (
    <div className="pd-assetsel">
      {ASSETS.map((a) => (
        <button
          key={a}
          type="button"
          disabled={exclude.includes(a)}
          className={`pd-assetsel-opt${value === a ? ' is-on' : ''}${exclude.includes(a) ? ' is-off' : ''}`}
          onClick={() => onChange(a)}
        >
          <Glyph asset={a} size="md" />
          <span className="pd-asset-code">{a}</span>
        </button>
      ))}
    </div>
  );
}

// ---- Currency pair picker --------------------------------------------------
interface CurrencyPairPickerProps {
  giveAsset: Asset;
  wantAsset: Asset;
  onGiveChange: (a: Asset) => void;
  onWantChange: (a: Asset) => void;
  onSwap: () => void;
}

export function CurrencyPairPicker({
  giveAsset,
  wantAsset,
  onGiveChange,
  onWantChange,
  onSwap,
}: CurrencyPairPickerProps) {
  return (
    <div className="pd-pair-picker">
      <div className="pd-pair-row">
        <span className="pd-pair-row-label">I have</span>
        <AssetSelect value={giveAsset} onChange={onGiveChange} exclude={[wantAsset]} />
      </div>
      <div className="pd-pair-swap-wrap">
        <button type="button" className="pd-swap-btn" onClick={onSwap} aria-label="Swap assets">
          <Icon name="arrowSwap" size={16} stroke={1.7} />
        </button>
      </div>
      <div className="pd-pair-row">
        <span className="pd-pair-row-label">I want to get</span>
        <AssetSelect value={wantAsset} onChange={onWantChange} exclude={[giveAsset]} />
      </div>
    </div>
  );
}

// ---- Stepper ---------------------------------------------------------------
export function Stepper({ step, total }: { step: number; total: number }) {
  return (
    <div className="pd-stepper">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`pd-stepdot${i + 1 === step ? ' is-active' : ''}${i + 1 < step ? ' is-done' : ''}`}
        >
          {i + 1 < step ? (
            <Icon name="check" size={13} stroke={2.4} />
          ) : (
            <span className="pd-num">{i + 1}</span>
          )}
        </span>
      ))}
    </div>
  );
}

// ---- Helpers ---------------------------------------------------------------
function fmtRelTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch {
    return '';
  }
}
