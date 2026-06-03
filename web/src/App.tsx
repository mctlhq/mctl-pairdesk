import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api.js';
import { Icon } from './components.js';
import { hapticSelection, isTelegram } from './tg.js';
import type { Me, UserRole } from './types.js';
import { Disclaimer } from './screens/Disclaimer.js';
import { Pending } from './screens/Pending.js';
import { OrderBook } from './screens/OrderBook.js';
import { OrderDetail } from './screens/OrderDetail.js';
import { CreateOrder } from './screens/CreateOrder.js';
import { Profile } from './screens/Profile.js';

export type Tab = 'book' | 'create' | 'profile';

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

  useEffect(() => { void loadMe(); }, [loadMe]);

  if (loading) return <div className="pd-center" style={{ color: 'var(--pd-hint)' }}>Loading…</div>;

  if (err === 'unauthorized') {
    return (
      <div className="pd-center" style={{ gap: 16 }}>
        <h2 style={{ margin: 0 }}>Open from Telegram</h2>
        <p style={{ color: 'var(--pd-hint)', margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          PairDesk runs as a Telegram Mini App. Open it from the bot to continue.
        </p>
        {!isTelegram && <DevLogin onLogin={() => void loadMe()} />}
      </div>
    );
  }
  if (err) {
    return (
      <div className="pd-center">
        <p style={{ color: 'var(--pd-far)', margin: 0 }}>{err}</p>
        <button
          style={{ padding: '10px 24px', borderRadius: 12, border: 'none', background: 'var(--pd-accent-eff)', color: 'var(--pd-accent-text)', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}
          onClick={() => void loadMe()}
        >Retry</button>
      </div>
    );
  }
  if (!me) return null;

  if (!me.disclaimer_accepted) return <Disclaimer onAccepted={() => void loadMe()} />;
  if (me.status !== 'approved') return <Pending me={me} onRefresh={() => void loadMe()} />;

  const canAdmin = me.super_admin || rank(me.role) >= rank('moderator');

  if (detailOrderId != null) {
    return <OrderDetail orderId={detailOrderId} me={me} onBack={() => setDetailOrderId(null)} />;
  }

  function nav(id: Tab) { if (id !== tab) hapticSelection(); setTab(id); }

  return (
    <div className="pd-app">
      <main className="pd-content">
        {tab === 'book'    && <OrderBook onOpen={setDetailOrderId} />}
        {tab === 'create'  && <CreateOrder onCreated={(id) => setDetailOrderId(id)} />}
        {tab === 'profile' && <Profile me={me} canAdmin={canAdmin} onSaved={() => void loadMe()} onOpenOrder={setDetailOrderId} />}
      </main>
      {tab !== 'create' && (
        <nav className="pd-tabbar">
          <button className={`pd-tab${tab === 'book' ? ' is-active' : ''}`} onClick={() => nav('book')} aria-label="Book" aria-current={tab === 'book' ? 'page' : undefined}>
            <Icon name="book" size={20} stroke={1.6} />
            <span className="pd-tab-label">Book</span>
          </button>
          <button className={`pd-tab pd-tab-fab${tab === 'create' ? ' is-active' : ''}`} onClick={() => nav('create')} aria-label="Create" aria-current={tab === 'create' ? 'page' : undefined}>
            <span className="pd-fab-circle">
              <Icon name="create" size={22} stroke={1.8} />
            </span>
          </button>
          <button className={`pd-tab${tab === 'profile' ? ' is-active' : ''}`} onClick={() => nav('profile')} aria-label="Profile" aria-current={tab === 'profile' ? 'page' : undefined}>
            <Icon name="user" size={20} stroke={1.6} />
            <span className="pd-tab-label">Profile</span>
          </button>
        </nav>
      )}
    </div>
  );
}

function DevLogin({ onLogin }: { onLogin: () => void }) {
  const [id, setId] = useState(localStorage.getItem('debugUserId') ?? '');
  return (
    <div style={{ background: 'var(--pd-surface)', borderRadius: 14, padding: 16, width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 12, color: 'var(--pd-hint)', margin: 0 }}>
        Dev mode — impersonate a Telegram id (AUTH_DEV_BYPASS only).
      </p>
      <input
        className="pd-input"
        style={{ background: 'var(--pd-card-bg)', border: '1.5px solid var(--pd-border)', borderRadius: 10, padding: '10px 13px' }}
        value={id}
        onChange={(e) => setId(e.target.value)}
        placeholder="e.g. 1000"
        inputMode="numeric"
      />
      <button
        style={{ padding: '10px 0', borderRadius: 10, border: 'none', background: 'var(--pd-accent-eff)', color: 'var(--pd-accent-text)', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}
        onClick={() => { localStorage.setItem('debugUserId', id.trim()); onLogin(); }}
      >Continue</button>
    </div>
  );
}
