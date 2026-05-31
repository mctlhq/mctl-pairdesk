import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badge, Empty, fmtAmount } from '../components.js';
import type { Deal } from '../types.js';

export function MyDeals({ onOpen }: { onOpen: (orderId: number) => void }) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ deals: Deal[] }>('/deals').then((r) => setDeals(r.deals)).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1>My deals</h1>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : deals.length === 0 ? (
        <Empty text="No deals yet. Respond to an order in the book to start one." />
      ) : (
        deals.map((d) => (
          <div className="card tappable" key={d.id} onClick={() => onOpen(d.order_id)}>
            <div className="row">
              <span className="amount">{fmtAmount(d.want_amount)} {d.want_asset}</span>
              <span className="spacer" />
              <Badge status={d.status} />
            </div>
            <div className="muted small">order #{d.order_id} · {d.order_status}</div>
          </div>
        ))
      )}
    </div>
  );
}
