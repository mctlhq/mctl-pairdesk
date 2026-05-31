import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Empty, OrderCard } from '../components.js';
import { ASSETS, type Asset, type Order } from '../types.js';

export function OrderBook({ onOpen }: { onOpen: (id: number) => void }) {
  const [want, setWant] = useState<Asset | ''>('');
  const [give, setGive] = useState<Asset | ''>('');
  const [city, setCity] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  function fetchOrders(before?: number, append = false) {
    const qs = new URLSearchParams();
    if (want) qs.set('want_asset', want);
    if (give) qs.set('give_asset', give);
    if (city.trim()) qs.set('location_city', city.trim());
    if (before != null) qs.set('before', String(before));
    return api
      .get<{ orders: Order[]; next_cursor: number | null }>(`/orders?${qs.toString()}`)
      .then((r) => {
        setOrders((prev) => append ? [...prev, ...r.orders] : r.orders);
        setNextCursor(r.next_cursor);
      });
  }

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      setNextCursor(null);
      fetchOrders().finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want, give, city]);

  function loadMore() {
    if (nextCursor == null) return;
    setLoadingMore(true);
    fetchOrders(nextCursor, true).finally(() => setLoadingMore(false));
  }

  return (
    <div>
      <h1>Order book</h1>

      <label>Wants (receives)</label>
      <div className="row wrap">
        <Chip on={want === ''} onClick={() => setWant('')}>All</Chip>
        {ASSETS.map((a) => (
          <Chip key={a} on={want === a} onClick={() => setWant(want === a ? '' : a)}>
            {a}
          </Chip>
        ))}
      </div>

      <label>Gives (pays in)</label>
      <div className="row wrap">
        <Chip on={give === ''} onClick={() => setGive('')}>Any</Chip>
        {ASSETS.map((a) => (
          <Chip key={a} on={give === a} onClick={() => setGive(give === a ? '' : a)}>
            {a}
          </Chip>
        ))}
      </div>

      <label>City</label>
      <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Bar" />

      <div style={{ marginTop: 16 }}>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : orders.length === 0 ? (
          <Empty text="No matching orders. Try widening the filters or create one." />
        ) : (
          <>
            {orders.map((o) => <OrderCard key={o.id} order={o} onOpen={onOpen} />)}
            {nextCursor != null && (
              <button className="ghost" style={{ width: '100%', marginTop: 8 }} onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={on ? 'pill on' : 'pill'} onClick={onClick}>
      {children}
    </button>
  );
}
