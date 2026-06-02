import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badge, Empty, fmtAmount, Icon } from '../components.js';
import { haptic } from '../tg.js';

interface PendingUser { id: number; telegram_id: number; username: string | null; first_name: string | null; created_at: string }
interface AdminOrder { id: number; created_by_user_id: number; creator_username: string | null; creator_name: string | null; want_asset: string; want_amount: string; status: string; location_city: string | null }
interface AdminDeal {
  id: number; status: string; created_at: string; updated_at: string;
  order_id: number; want_asset: string; want_amount: string; order_status: string; location_city: string | null;
  creator_username: string | null; creator_name: string;
  responder_username: string | null; responder_name: string;
}

type View = 'users' | 'orders' | 'deals';

export function Admin() {
  const [view, setView] = useState<View>('users');
  const tabs: { id: View; label: string }[] = [
    { id: 'users',  label: 'Pending users' },
    { id: 'orders', label: 'Orders' },
    { id: 'deals',  label: 'Deals' },
  ];
  return (
    <div className="pd-page">
      <h1 className="pd-h1">Admin</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto' }}>
        {tabs.map((t) => (
          <button key={t.id} className={`pd-chip${view === t.id ? ' is-on' : ''}`} onClick={() => setView(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {view === 'users'  && <PendingUsers />}
      {view === 'orders' && <Orders />}
      {view === 'deals'  && <Deals />}
    </div>
  );
}

function userLabel(u: Pick<PendingUser, 'username' | 'first_name' | 'telegram_id'>): string {
  if (u.username) return `@${u.username}`;
  if (u.first_name) return `${u.first_name} · id ${u.telegram_id}`;
  return `id ${u.telegram_id}`;
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
          {/* Tap avatar/meta → open Telegram chat by ID (works even without @username) */}
          <a href={`tg://user?id=${u.telegram_id}`} style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: 'inherit', flex: 1, minWidth: 0 }}>
            <span className="pd-avatar">{(u.username || u.first_name || 'U').slice(0, 1).toUpperCase()}</span>
            <span className="pd-resp-meta">
              <span className="pd-maker-name">{userLabel(u)}</span>
              <span className="pd-maker-sub pd-num">{new Date(u.created_at).toLocaleDateString()}</span>
            </span>
          </a>
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
              #{o.id} · by {o.creator_username ? `@${o.creator_username}` : (o.creator_name ?? `#${o.created_by_user_id}`)}{o.location_city ? ` · ${o.location_city}` : ''}
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

function Deals() {
  const [deals, setDeals] = useState<AdminDeal[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get<{ deals: AdminDeal[] }>('/admin/deals').then((r) => setDeals(r.deals)).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="pd-muted-row">Loading…</p>;
  if (deals.length === 0) return <Empty text="No deals yet." />;

  return (
    <div className="pd-list">
      {deals.map((d) => {
        const creator   = d.creator_username   ? `@${d.creator_username}`   : d.creator_name;
        const responder = d.responder_username ? `@${d.responder_username}` : d.responder_name;
        return (
          <div className="pd-card" key={d.id}>
            <div className="pd-row" style={{ marginBottom: 8 }}>
              <span className="pd-num" style={{ fontWeight: 700, fontSize: 17 }}>
                {fmtAmount(d.want_amount)} {d.want_asset}
              </span>
              <span className="pd-spacer" />
              <Badge status={d.status} />
            </div>
            <div style={{ fontSize: 13, color: 'var(--pd-text-2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div className="pd-row" style={{ gap: 6 }}>
                <Icon name="user" size={13} cls="pd-mut-ic" />
                <span>{creator}</span>
                <Icon name="arrowSwap" size={13} cls="pd-mut-ic" />
                <span>{responder}</span>
              </div>
              <div className="pd-row" style={{ gap: 6, color: 'var(--pd-hint)', fontSize: 12 }}>
                <span>order #{d.order_id}</span>
                {d.location_city && <><span className="pd-dot-sep">·</span><Icon name="pin" size={12} cls="pd-mut-ic" /><span>{d.location_city}</span></>}
                <span className="pd-dot-sep">·</span>
                <span className="pd-num">{new Date(d.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
