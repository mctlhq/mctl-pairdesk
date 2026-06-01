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
    <div className="pd-page">
      <h1 className="pd-h1">My deals</h1>
      {loading ? (
        <p className="pd-muted-row">Loading…</p>
      ) : deals.length === 0 ? (
        <Empty text="No deals yet. Respond to an order in the book to start one." />
      ) : (
        <div className="pd-list">
          {deals.map((d) => (
            <button className="pd-card" key={d.id} onClick={() => onOpen(d.order_id)}>
              <div className="pd-row">
                <span className="pd-want-amt pd-num" style={{ fontSize: 17 }}>
                  {fmtAmount(d.want_amount)} {d.want_asset}
                </span>
                <span className="pd-spacer" />
                <Badge status={d.status} />
              </div>
              <div className="pd-muted-row" style={{ padding: '4px 0 0', fontSize: 12 }}>
                order #{d.order_id}{d.order_status ? ` · ${d.order_status}` : ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
