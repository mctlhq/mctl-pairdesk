import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Empty, OrderCard } from '../components.js';
import type { Order } from '../types.js';

export function MyOrders({ onOpen }: { onOpen: (id: number) => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ orders: Order[] }>('/orders/mine').then((r) => setOrders(r.orders)).finally(() => setLoading(false));
  }, []);

  return (
    <div className="pd-page">
      <h1 className="pd-h1">My orders</h1>
      {loading ? (
        <p className="pd-muted-row">Loading…</p>
      ) : orders.length === 0 ? (
        <Empty text="No orders yet. Create one from the Order book tab." />
      ) : (
        <div className="pd-list">
          {orders.map((o) => <OrderCard key={o.id} order={o} onOpen={onOpen} variant="rate" />)}
        </div>
      )}
    </div>
  );
}
