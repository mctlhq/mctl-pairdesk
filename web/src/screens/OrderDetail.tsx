import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api.js';
import { Badge, fmtAmount, GiveOptions } from '../components.js';
import { haptic, showBackButton } from '../tg.js';
import type { Deal, Me, Order } from '../types.js';

export function OrderDetail({ orderId, me, onBack }: { orderId: number; me: Me; onBack: () => void }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [o, d] = await Promise.all([
      api.get<Order>(`/orders/${orderId}`),
      api.get<{ deals: Deal[] }>(`/orders/${orderId}/deals`),
    ]);
    setOrder(o);
    setDeals(d.deals);
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => showBackButton(onBack), [onBack]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      haptic('success');
      setMsg(ok);
      await load();
    } catch (e) {
      haptic('error');
      setMsg(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!order) return <div className="content"><p className="muted">Loading…</p></div>;

  const isMaker = me.id === order.created_by_user_id;
  const myDeal = deals.find((d) => d.responder_user_id === me.id);
  const requests = deals.filter((d) => d.status === 'requested');
  const acceptedDeal = deals.find((d) => d.status === 'accepted' || d.status === 'completed');

  return (
    <div className="content">
      <button className="ghost" onClick={onBack}>← Back</button>
      <div className="row">
        <h1 style={{ margin: 0 }}>{fmtAmount(order.want_amount)} {order.want_asset}</h1>
        <span className="spacer" />
        <Badge status={order.status} />
      </div>
      <p className="muted small">
        wants {order.want_asset}
        {order.location_city ? ` in ${order.location_city}` : ''}
        {order.maker ? ` · by ${order.maker.display_name || (order.maker.username ? '@' + order.maker.username : 'member')}` : ''}
      </p>

      <div className="card">
        <h3>Will give (one of)</h3>
        <GiveOptions order={order} />
      </div>
      {order.comment && <div className="card"><div className="muted small">Note</div>{order.comment}</div>}

      {msg && <p className={msg.includes(' ') && /fail|error|cannot|already|not |is /.test(msg) ? 'error' : 'pos'}>{msg}</p>}

      {/* Responder view */}
      {!isMaker && (
        <div className="stack">
          {!myDeal && order.status === 'active' && (
            <button disabled={busy} onClick={() => void run(() => api.post(`/orders/${order.id}/respond`), 'Response sent — the maker will review it.')}>
              Respond to this order
            </button>
          )}
          {myDeal && (
            <div className="card">
              <div className="row"><h3>Your response</h3><span className="spacer" /><Badge status={myDeal.status} /></div>
              {myDeal.status === 'accepted' && <ContactPanel dealId={myDeal.id} me={me} onComplete={() => void run(() => api.post(`/deals/${myDeal.id}/complete`), 'Marked complete.')} busy={busy} />}
              {myDeal.status === 'rejected' && <p className="muted small">This response was not selected.</p>}
              {myDeal.status === 'completed' && <p className="pos small">Deal completed.</p>}
            </div>
          )}
        </div>
      )}

      {/* Maker view */}
      {isMaker && (
        <div className="stack">
          {order.status === 'active' && (
            <>
              <h3>Responses ({requests.length})</h3>
              {requests.length === 0 && <p className="muted small">No responses yet.</p>}
              {requests.map((d) => (
                <div className="card" key={d.id}>
                  <div className="row">
                    <span>Responder #{d.responder_user_id}</span>
                    <span className="spacer" />
                    <button className="secondary" disabled={busy} onClick={() => void run(() => api.post(`/deals/${d.id}/reject`), 'Response rejected.')}>Reject</button>
                    <button disabled={busy} onClick={() => void run(() => api.post(`/deals/${d.id}/accept`), 'Accepted — contact details are now shared.')}>Accept</button>
                  </div>
                </div>
              ))}
            </>
          )}
          {acceptedDeal && (
            <div className="card">
              <div className="row"><h3>Accepted deal</h3><span className="spacer" /><Badge status={acceptedDeal.status} /></div>
              {acceptedDeal.status === 'accepted' && <ContactPanel dealId={acceptedDeal.id} me={me} onComplete={() => void run(() => api.post(`/deals/${acceptedDeal.id}/complete`), 'Marked complete.')} busy={busy} />}
              {acceptedDeal.status === 'completed' && <p className="pos small">Deal completed.</p>}
            </div>
          )}
          {['active', 'reserved'].includes(order.status) && (
            <button className="secondary" disabled={busy} onClick={() => void run(() => api.post(`/orders/${order.id}/cancel`), 'Order cancelled.')}>
              Cancel order
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Loads the deal detail (contact reveal happens server-side) and shows contacts. */
function ContactPanel({ dealId, me, onComplete, busy }: { dealId: number; me: Me; onComplete: () => void; busy: boolean }) {
  const [deal, setDeal] = useState<Deal | null>(null);
  useEffect(() => {
    api.get<Deal>(`/deals/${dealId}`).then(setDeal).catch(() => setDeal(null));
  }, [dealId]);

  if (!deal) return <p className="muted small">Loading contact…</p>;
  if (!deal.contacts_revealed) return <p className="muted small">Contact details unavailable.</p>;

  const counterparty = me.id === deal.creator_user_id ? deal.responder_contact : deal.creator_contact;
  return (
    <div className="stack">
      <p className="muted small">Arrange and settle directly. PairDesk is not a party to this deal.</p>
      <div>
        <div className="kv"><span className="k">Telegram</span><span>{counterparty?.username ? `@${counterparty.username}` : '—'}</span></div>
        <div className="kv"><span className="k">Phone</span><span>{counterparty?.phone || '—'}</span></div>
        <div className="kv"><span className="k">Details</span><span>{counterparty?.contact || '—'}</span></div>
      </div>
      <button disabled={busy} onClick={onComplete}>Mark deal complete</button>
    </div>
  );
}
