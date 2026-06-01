import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Badge, Empty, fmtAmount, Icon, OrderCard } from '../components.js';
import { hapticSelection } from '../tg.js';
import type { Deal, Me, Order } from '../types.js';

type DealsTab = 'orders' | 'responses' | 'active' | 'history';

function counterpartyLabel(d: Deal, meId: number): string {
  const isCreator = d.creator_user_id === meId;
  const username = isCreator ? d.responder_username : d.creator_username;
  const name = isCreator ? d.responder_name : d.creator_name;
  if (username) return `@${username}`;
  if (name) return name;
  return 'member';
}

export function Deals({ onOpen, me }: { onOpen: (orderId: number) => void; me: Me }) {
  const [tab, setTab] = useState<DealsTab>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    Promise.all([
      api.get<{ orders: Order[] }>('/orders/mine'),
      api.get<{ deals: Deal[] }>('/deals'),
    ])
      .then(([o, d]) => {
        if (cancelled) return;
        setOrders(o.orders);
        setDeals(d.deals);
      })
      .catch((e) => !cancelled && setErr((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  const buckets = useMemo(() => ({
    responses: deals.filter((d) => d.status === 'requested'),
    active: deals.filter((d) => d.status === 'accepted'),
    history: deals.filter((d) => !['requested', 'accepted'].includes(d.status)),
  }), [deals]);

  const tabs: Array<{ id: DealsTab; label: string; count: number }> = [
    { id: 'orders', label: 'My orders', count: orders.length },
    { id: 'responses', label: 'Responses', count: buckets.responses.length },
    { id: 'active', label: 'Active', count: buckets.active.length },
    { id: 'history', label: 'History', count: buckets.history.length },
  ];

  return (
    <div className="pd-page">
      <div className="pd-page-head">
        <h1 className="pd-h1">Deals</h1>
      </div>

      <div className="pd-segment" role="tablist" aria-label="Deals views">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`pd-segment-opt${tab === t.id ? ' is-on' : ''}`}
            onClick={() => {
              if (tab !== t.id) hapticSelection();
              setTab(t.id);
            }}
          >
            <span>{t.label}</span>
            <span className="pd-segment-count pd-num">{t.count}</span>
          </button>
        ))}
      </div>

      {err ? (
        <div className="pd-state-card pd-state-error">
          <Icon name="close" size={18} />
          <span>{err}</span>
        </div>
      ) : loading ? (
        <div className="pd-list" aria-busy="true">
          <div className="pd-skeleton-card" />
          <div className="pd-skeleton-card" />
          <div className="pd-skeleton-card" />
        </div>
      ) : tab === 'orders' ? (
        orders.length === 0 ? (
          <Empty text="No orders yet. Create a request when you want to receive funds." />
        ) : (
          <div className="pd-list">
            {orders.map((o) => <OrderCard key={o.id} order={o} onOpen={onOpen} variant="rate" />)}
          </div>
        )
      ) : (
        <DealList deals={buckets[tab]} me={me} onOpen={onOpen} tab={tab} />
      )}
    </div>
  );
}

function DealList({
  deals,
  me,
  onOpen,
  tab,
}: {
  deals: Deal[];
  me: Me;
  onOpen: (orderId: number) => void;
  tab: Exclude<DealsTab, 'orders'>;
}) {
  if (deals.length === 0) {
    const copy = {
      responses: 'No pending responses. Respond to an order in the book to start one.',
      active: 'No active deals. Accepted deals with shared contacts will appear here.',
      history: 'Completed, rejected, cancelled, and expired deals will appear here.',
    }[tab];
    return <Empty text={copy} />;
  }

  return (
    <div className="pd-list">
      {deals.map((d) => {
        const cp = counterpartyLabel(d, me.id);
        const isAccepted = d.status === 'accepted';
        const isCompleted = d.status === 'completed';
        return (
          <button className="pd-card pd-deal-card" key={d.id} onClick={() => onOpen(d.order_id)}>
            <div className="pd-row" style={{ marginBottom: 8 }}>
              <span className="pd-want-amt pd-num" style={{ fontSize: 17, fontWeight: 700 }}>
                {fmtAmount(d.want_amount)} {d.want_asset ?? ''}
              </span>
              <span className="pd-spacer" />
              <Badge status={d.status} />
            </div>

            <div className="pd-row pd-deal-meta">
              <Icon name="user" size={13} cls="pd-mut-ic" />
              <span>{cp}</span>
              {d.location_city && (
                <>
                  <span className="pd-dot-sep">·</span>
                  <Icon name="pin" size={13} cls="pd-mut-ic" />
                  <span>{d.location_city}</span>
                </>
              )}
            </div>

            {isAccepted && (
              <div className="pd-deal-hint pd-deal-hint-good">
                <Icon name="check" size={13} />
                Contacts available — tap to view and arrange directly
              </div>
            )}
            {isCompleted && <div className="pd-deal-hint">Deal completed</div>}
            {!isAccepted && !isCompleted && (
              <div className="pd-deal-hint">
                {d.status === 'requested'
                  // creator_user_id is the order maker: if that's me, this is an
                  // incoming response on my order awaiting MY review — not me
                  // waiting on someone else's review.
                  ? (d.creator_user_id === me.id ? 'New response — tap to review' : 'Waiting for maker to review')
                  : d.status}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
