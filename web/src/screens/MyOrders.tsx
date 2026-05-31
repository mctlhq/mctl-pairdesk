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
    <div>
      <h1>My orders</h1>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : orders.length === 0 ? (
        <Empty text="You haven't created any orders yet." />
      ) : (
        orders.map((o) => <OrderCard key={o.id} order={o} onOpen={onOpen} />)
      )}
    </div>
  );
}
