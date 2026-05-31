import type { Order } from './types.js';

export function fmtAmount(s: string | number | null | undefined): string {
  if (s == null) return '—';
  const n = typeof s === 'number' ? s : Number.parseFloat(s);
  if (!Number.isFinite(n)) return String(s);
  return n.toLocaleString('en-US', { maximumFractionDigits: 8 });
}

export function Badge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{status}</span>;
}

/** Factual market-deviation tag; flags large deviations (|Δ| > 10%) as a warning. */
export function DeltaTag({ delta }: { delta: string | null }) {
  if (delta == null) return null;
  const d = Number.parseFloat(delta);
  if (!Number.isFinite(d)) return null;
  const sign = d > 0 ? '+' : '';
  const cls = Math.abs(d) > 10 ? 'neg' : 'muted';
  return (
    <span className={`small ${cls}`}>
      {sign}
      {d.toFixed(1)}% vs CBR
    </span>
  );
}

export function GiveOptions({ order }: { order: Order }) {
  return (
    <div>
      {order.give_options.map((g) => (
        <div className="give-line" key={g.id}>
          <div className="row">
            <strong>{g.asset}</strong>
            {g.max_rate && <span className="muted">≤ {fmtAmount(g.max_rate)}</span>}
            <span className="spacer" />
            {g.reference_rate && <span className="muted small">ref {fmtAmount(g.reference_rate)}</span>}
          </div>
          <div className="row wrap">
            {g.payment_methods.map((m) => (
              <span className="pill" key={m}>
                {m}
              </span>
            ))}
            <span className="spacer" />
            <DeltaTag delta={g.delta_percent} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function OrderCard({ order, onOpen }: { order: Order; onOpen?: (id: number) => void }) {
  return (
    <div className={`card ${onOpen ? 'tappable' : ''}`} onClick={onOpen ? () => onOpen(order.id) : undefined}>
      <div className="row">
        <span className="amount">
          {fmtAmount(order.want_amount)} {order.want_asset}
        </span>
        <span className="spacer" />
        <Badge status={order.status} />
      </div>
      <div className="muted small">
        wants {order.want_asset}
        {order.location_city ? ` · ${order.location_city}` : ''}
        {' · gives '}
        {order.give_options.map((g) => g.asset).join(' / ')}
      </div>
      {order.maker && (
        <div className="muted small">
          {order.maker.display_name || (order.maker.username ? `@${order.maker.username}` : 'member')} ·{' '}
          {order.maker.completed_deals_count ?? 0} deals
        </div>
      )}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="muted" style={{ textAlign: 'center', marginTop: 32 }}>{text}</p>;
}
