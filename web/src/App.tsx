import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api.js';
import { isTelegram } from './tg.js';
import type { Me, UserRole } from './types.js';
import { Disclaimer } from './screens/Disclaimer.js';
import { Pending } from './screens/Pending.js';
import { OrderBook } from './screens/OrderBook.js';
import { OrderDetail } from './screens/OrderDetail.js';
import { CreateOrder } from './screens/CreateOrder.js';
import { MyOrders } from './screens/MyOrders.js';
import { MyDeals } from './screens/MyDeals.js';
import { Subscriptions } from './screens/Subscriptions.js';
import { Profile } from './screens/Profile.js';
import { Admin } from './screens/Admin.js';

export type Tab = 'book' | 'create' | 'mine' | 'deals' | 'subs' | 'profile' | 'admin';

function rank(role: UserRole): number {
  return { user: 0, trusted_user: 1, moderator: 2, admin: 3 }[role];
}

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('book');
  const [detailOrderId, setDetailOrderId] = useState<number | null>(null);

  const loadMe = useCallback(async () => {
    try {
      setMe(await api.get<Me>('/me'));
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 401 ? 'unauthorized' : (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  if (loading) return <div className="center muted">Loading…</div>;

  if (err === 'unauthorized') {
    return (
      <div className="center stack">
        <h2>Open from Telegram</h2>
        <p className="muted">PairDesk runs as a Telegram Mini App. Open it from the bot to continue.</p>
        {!isTelegram && <DevLogin onLogin={() => void loadMe()} />}
      </div>
    );
  }
  if (err) return <div className="center stack"><p className="error">{err}</p><button onClick={() => void loadMe()}>Retry</button></div>;
  if (!me) return null;

  if (!me.disclaimer_accepted) return <Disclaimer onAccepted={() => void loadMe()} />;
  if (me.status !== 'approved') return <Pending me={me} onRefresh={() => void loadMe()} />;

  const canAdmin = me.super_admin || rank(me.role) >= rank('moderator');

  if (detailOrderId != null) {
    return <OrderDetail orderId={detailOrderId} me={me} onBack={() => setDetailOrderId(null)} />;
  }

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'book', label: 'Book', show: true },
    { id: 'create', label: 'Create', show: true },
    { id: 'mine', label: 'My orders', show: true },
    { id: 'deals', label: 'Deals', show: true },
    { id: 'subs', label: 'Alerts', show: true },
    { id: 'profile', label: 'Profile', show: true },
    { id: 'admin', label: 'Admin', show: canAdmin },
  ];

  return (
    <div className="app">
      <main className="content">
        {tab === 'book' && <OrderBook onOpen={setDetailOrderId} />}
        {tab === 'create' && <CreateOrder onCreated={(id) => setDetailOrderId(id)} />}
        {tab === 'mine' && <MyOrders onOpen={setDetailOrderId} />}
        {tab === 'deals' && <MyDeals onOpen={setDetailOrderId} />}
        {tab === 'subs' && <Subscriptions />}
        {tab === 'profile' && <Profile me={me} onSaved={() => void loadMe()} />}
        {tab === 'admin' && canAdmin && <Admin />}
      </main>
      <nav className="tabbar">
        {tabs.filter((t) => t.show).map((t) => (
          <button key={t.id} className={t.id === tab ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function DevLogin({ onLogin }: { onLogin: () => void }) {
  const [id, setId] = useState(localStorage.getItem('debugUserId') ?? '');
  return (
    <div className="stack card">
      <p className="muted small">Dev mode: impersonate a Telegram id (backend AUTH_DEV_BYPASS only).</p>
      <input value={id} onChange={(e) => setId(e.target.value)} placeholder="e.g. 1000" inputMode="numeric" />
      <button
        onClick={() => {
          localStorage.setItem('debugUserId', id.trim());
          onLogin();
        }}
      >
        Continue
      </button>
    </div>
  );
}
