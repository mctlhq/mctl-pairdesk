import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badge, Empty, fmtAmount, Icon } from '../components.js';
import { haptic } from '../tg.js';

interface PendingUser { id: number; telegram_id: number; username: string | null; first_name: string | null; created_at: string }
interface AdminOrder { id: number; created_by_user_id: number; want_asset: string; want_amount: string; status: string; location_city: string | null }

export function Admin() {
  const [view, setView] = useState<'users' | 'orders'>('users');
  return (
    <div className="pd-page">
      <h1 className="pd-h1">Admin</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          className={`pd-chip${view === 'users' ? ' is-on' : ''}`}
          onClick={() => setView('users')}>Pending users</button>
        <button
          className={`pd-chip${view === 'orders' ? ' is-on' : ''}`}
          onClick={() => setView('orders')}>Orders</button>
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

  if (loading) return <p className="pd-muted-row">Loading…</p>;
  if (users.length === 0) return <Empty text="No users awaiting approval." />;
  return (
    <div className="pd-resp-list">
      {users.map((u) => (
        <div className="pd-resp" key={u.id}>
          <span className="pd-avatar">{(u.username || u.first_name || 'U').slice(0, 1).toUpperCase()}</span>
          <span className="pd-resp-meta">
            <span className="pd-maker-name">{u.username ? `@${u.username}` : u.first_name ?? `id ${u.telegram_id}`}</span>
            <span className="pd-maker-sub pd-num">{new Date(u.created_at).toLocaleDateString()}</span>
          </span>
          <span className="pd-spacer" />
          <span className="pd-resp-actions">
            <button className="pd-btn-ghost-sm" onClick={() => void act(u.id, 'reject')}>Reject</button>
            <button className="pd-btn-accent-sm" onClick={() => void act(u.id, 'approve')}>Approve</button>
          </span>
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

  async function remove(id: number) { await api.post(`/admin/orders/${id}/remove`); haptic('success'); void load(); }

  if (loading) return <p className="pd-muted-row">Loading…</p>;
  if (orders.length === 0) return <Empty text="No orders." />;
  return (
    <div className="pd-list">
      {orders.map((o) => (
        <div className="pd-card" key={o.id}>
          <div className="pd-row">
            <span className="pd-num" style={{ fontWeight: 700, fontSize: 17 }}>{fmtAmount(o.want_amount)} {o.want_asset}</span>
            <span className="pd-spacer" />
            <Badge status={o.status} />
          </div>
          <div className="pd-row" style={{ marginTop: 8 }}>
            <span className="pd-muted-row" style={{ padding: 0, fontSize: 12 }}>
              #{o.id} · by #{o.created_by_user_id}{o.location_city ? ` · ${o.location_city}` : ''}
            </span>
            <span className="pd-spacer" />
            <button className="pd-iconbtn" title="Flag"
              onClick={() => void api.post(`/admin/orders/${o.id}/flag`, { reason: 'flagged from admin panel' }).then(() => haptic('success'))}>
              <Icon name="dots" size={16} />
            </button>
            {o.status !== 'cancelled' && (
              <button className="pd-btn-ghost-sm" onClick={() => void remove(o.id)}>Remove</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
