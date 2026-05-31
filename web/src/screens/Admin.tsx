import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badge, Empty, fmtAmount } from '../components.js';
import { haptic } from '../tg.js';

interface PendingUser { id: number; telegram_id: number; username: string | null; first_name: string | null; created_at: string }
interface AdminOrder { id: number; created_by_user_id: number; want_asset: string; want_amount: string; status: string; location_city: string | null }

export function Admin() {
  const [view, setView] = useState<'users' | 'orders'>('users');
  return (
    <div>
      <h1>Admin</h1>
      <div className="row">
        <button className={view === 'users' ? '' : 'secondary'} onClick={() => setView('users')} style={{ flex: 1 }}>Pending users</button>
        <button className={view === 'orders' ? '' : 'secondary'} onClick={() => setView('orders')} style={{ flex: 1 }}>Orders</button>
      </div>
      {view === 'users' ? <PendingUsers /> : <Orders />}
    </div>
  );
}

function PendingUsers() {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const load = () => api.get<{ users: PendingUser[] }>('/admin/users/pending').then((r) => setUsers(r.users)).finally(() => setLoading(false));
  useEffect(() => { void load(); }, []);

  async function act(id: number, action: 'approve' | 'reject') {
    await api.post(`/admin/users/${id}/${action}`);
    haptic('success');
    void load();
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (users.length === 0) return <Empty text="No users awaiting approval." />;
  return (
    <div style={{ marginTop: 12 }}>
      {users.map((u) => (
        <div className="card" key={u.id}>
          <div className="row">
            <span>{u.username ? `@${u.username}` : u.first_name || `id ${u.telegram_id}`}</span>
            <span className="spacer" />
            <button className="secondary" onClick={() => void act(u.id, 'reject')}>Reject</button>
            <button onClick={() => void act(u.id, 'approve')}>Approve</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Orders() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const load = () => api.get<{ orders: AdminOrder[] }>('/admin/orders').then((r) => setOrders(r.orders)).finally(() => setLoading(false));
  useEffect(() => { void load(); }, []);

  async function remove(id: number) {
    await api.post(`/admin/orders/${id}/remove`);
    haptic('success');
    void load();
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (orders.length === 0) return <Empty text="No orders." />;
  return (
    <div style={{ marginTop: 12 }}>
      {orders.map((o) => (
        <div className="card" key={o.id}>
          <div className="row">
            <span className="amount">{fmtAmount(o.want_amount)} {o.want_asset}</span>
            <span className="spacer" />
            <Badge status={o.status} />
          </div>
          <div className="row">
            <span className="muted small">#{o.id} · by #{o.created_by_user_id}{o.location_city ? ` · ${o.location_city}` : ''}</span>
            <span className="spacer" />
            <button className="ghost" onClick={() => void api.post(`/admin/orders/${o.id}/flag`, { reason: 'flagged from admin panel' }).then(() => haptic('success'))}>Flag</button>
            {o.status !== 'cancelled' && <button className="secondary" onClick={() => void remove(o.id)}>Remove</button>}
          </div>
        </div>
      ))}
    </div>
  );
}
