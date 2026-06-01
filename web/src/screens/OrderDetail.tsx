import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api.js';
import { Badge, fmtAmount, GiveRow, Icon, Maker, PD_GLYPH } from '../components.js';
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

  useEffect(() => { void load(); }, [load]);
  useEffect(() => showBackButton(onBack), [onBack]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try {
      await fn();
      haptic('success');
      setMsg(ok);
      await load();
    } catch (e) {
      haptic('error');
      setMsg(e instanceof ApiError ? e.message : (e as Error).message);
    } finally { setBusy(false); }
  }

  if (!order) return <div className="pd-content"><p className="pd-muted-row">Loading…</p></div>;

  const isMaker = me.id === order.created_by_user_id;
  const myDeal = deals.find((d) => d.responder_user_id === me.id);
  const requests = deals.filter((d) => d.status === 'requested');
  const acceptedDeal = deals.find((d) => d.status === 'accepted' || d.status === 'completed');

  return (
    <div className="pd-content">
      <div className="pd-detail-hero">
        <div className="pd-row">
          <span className="pd-want pd-want-lg">
            <span className={`pd-glyph pd-glyph-${order.want_asset} pd-glyph-lg`} aria-hidden="true">
              {PD_GLYPH[order.want_asset] ?? order.want_asset[0]}
            </span>
            <span className="pd-want-amt pd-num">{fmtAmount(order.want_amount)}</span>
            <span className="pd-want-code">{order.want_asset}</span>
          </span>
          <span className="pd-spacer" />
          <Badge status={order.status} />
        </div>
        <div className="pd-detail-meta">
          <span className="pd-meta-item"><Icon name="pin" size={14} cls="pd-mut-ic" />{order.location_city ?? 'Any location'}</span>
          <span className="pd-dot-sep">·</span>
          <span className="pd-meta-item">
            <Icon name="clock" size={14} cls="pd-mut-ic" />
            <span className="pd-num">{order.created_at ? new Date(order.created_at).toLocaleDateString() : ''}</span>
          </span>
        </div>
      </div>

      {!isMaker && order.maker && (
        <div className="pd-maker-card">
          <Maker maker={order.maker} />
          <span className="pd-spacer" />
          <span className="pd-verified"><Icon name="shield" size={14} fill />Vetted</span>
        </div>
      )}

      <div className="pd-section">
        <div className="pd-section-head">
          <span>Will give — one of</span>
          <span className="pd-section-note">курс vs ЦБ РФ</span>
        </div>
        <div className="pd-give-list">
          {order.give_options.map((g) => <GiveRow key={g.id} g={g} base={order.want_asset} wantAmount={order.want_amount} />)}
        </div>
      </div>

      {order.comment && (
        <div className="pd-note">
          <span className="pd-note-label">Note from maker</span>
          <p className="pd-note-body">{order.comment}</p>
        </div>
      )}

      {msg && (
        <p style={{ color: /fail|error|cannot|already|not |is /.test(msg) ? 'var(--pd-far)' : 'var(--pd-good)', fontSize: 13, margin: '0 0 12px' }}>
          {msg}
        </p>
      )}

      {!isMaker && (
        <>
          {!myDeal && order.status === 'active' && (
            <>
              <div className="pd-safety">
                <Icon name="shield" size={15} cls="pd-mut-ic" />
                <span>PairDesk is a bulletin board — not a party to any deal. You arrange and settle directly.</span>
              </div>
              <button className="pd-btn-block" disabled={busy}
                onClick={() => void run(() => api.post(`/orders/${order.id}/respond`), 'Response sent — the maker will review it.')}>
                Respond to this order
              </button>
            </>
          )}
          {myDeal?.status === 'requested' && (
            <div className="pd-status-card pd-status-pending">
              <span className="pd-status-ic"><Icon name="clock" size={18} /></span>
              <div>
                <p className="pd-status-title">Response sent</p>
                <p className="pd-status-sub">The maker will review and share contacts if accepted.</p>
              </div>
            </div>
          )}
          {(myDeal?.status === 'accepted' || myDeal?.status === 'completed') && myDeal && (
            <ContactPanel dealId={myDeal.id} me={me} onComplete={() => void run(() => api.post(`/deals/${myDeal.id}/complete`), 'Marked complete.')} busy={busy} done={myDeal.status === 'completed'} />
          )}
          {myDeal?.status === 'rejected' && <p className="pd-muted-row">This response was not selected.</p>}
        </>
      )}

      {isMaker && (
        <div className="pd-section">
          <div className="pd-section-head">
            <span>Responses</span>
            <span className="pd-section-count pd-num">{requests.length}</span>
          </div>
          {deals.length === 0 && <p className="pd-muted-row">No responses yet.</p>}
          <div className="pd-resp-list">
            {deals.map((d) => {
              const rLabel = d.responder_username ? `@${d.responder_username}` : (d.responder_name ?? `id ${d.responder_user_id}`);
              // Only link by @username (public info); telegram_id is gated behind accept
              const rLink = d.responder_username ? `https://t.me/${d.responder_username}` : undefined;
              return (
              <div className={`pd-resp${d.status !== 'requested' ? ' is-resolved' : ''}`} key={d.id}>
                <span className="pd-avatar">{(d.responder_username || d.responder_name || 'R').slice(0, 1).toUpperCase()}</span>
                <span className="pd-resp-meta">
                  {rLink ? (
                    <a href={rLink} className="pd-maker-name" style={{ textDecoration: 'none', color: 'inherit' }}>{rLabel}</a>
                  ) : (
                    <span className="pd-maker-name">{rLabel}</span>
                  )}
                  <span className="pd-maker-sub"><Badge status={d.status} /></span>
                </span>
                <span className="pd-spacer" />
                {d.status === 'requested' && order.status === 'active' ? (
                  <span className="pd-resp-actions">
                    <button className="pd-btn-ghost-sm" disabled={busy} onClick={() => void run(() => api.post(`/deals/${d.id}/reject`), 'Rejected.')}>Reject</button>
                    <button className="pd-btn-accent-sm" disabled={busy} onClick={() => void run(() => api.post(`/deals/${d.id}/accept`), 'Accepted — contacts shared.')}>Accept</button>
                  </span>
                ) : <Badge status={d.status} />}
              </div>
            );})}

          </div>
          {acceptedDeal && (
            <ContactPanel dealId={acceptedDeal.id} me={me} onComplete={() => void run(() => api.post(`/deals/${acceptedDeal.id}/complete`), 'Marked complete.')} busy={busy} done={acceptedDeal.status === 'completed'} />
          )}
          {['active', 'reserved'].includes(order.status) && (
            <button className="pd-btn-ghost-sm" style={{ width: '100%', marginTop: 16, justifyContent: 'center' }}
              disabled={busy} onClick={() => void run(() => api.post(`/orders/${order.id}/cancel`), 'Order cancelled.')}>
              Cancel order
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ContactPanel({ dealId, me, onComplete, busy, done = false }: { dealId: number; me: Me; onComplete: () => void; busy: boolean; done?: boolean }) {
  const [deal, setDeal] = useState<Deal | null>(null);
  useEffect(() => { api.get<Deal>(`/deals/${dealId}`).then(setDeal).catch(() => setDeal(null)); }, [dealId]);
  if (!deal) return <p className="pd-muted-row">Loading contact…</p>;
  if (!deal.contacts_revealed) return <p className="pd-muted-row">Contact details unavailable.</p>;
  const cp = me.id === deal.creator_user_id ? deal.responder_contact : deal.creator_contact;
  const tgHref = cp?.username
    ? `https://t.me/${cp.username}`
    : cp?.telegram_id ? `tg://user?id=${cp.telegram_id}` : undefined;
  const tgLabel = cp?.username ? `@${cp.username}` : cp?.telegram_id ? `id ${cp.telegram_id}` : '—';
  return (
    <div className="pd-contact-card">
      <div className="pd-contact-head"><Icon name="check" size={16} cls="pd-good-ic" /><span>Contacts shared</span></div>
      <div className="pd-kv">
        <span className="pd-k">Telegram</span>
        {tgHref ? (
          <a href={tgHref} className="pd-v" style={{ color: 'var(--pd-accent-eff)', fontWeight: 600, textDecoration: 'none' }}>{tgLabel} ↗</a>
        ) : (
          <span className="pd-v">{tgLabel}</span>
        )}
      </div>
      <div className="pd-kv"><span className="pd-k">Phone</span><span className="pd-v pd-num">{cp?.phone ?? '—'}</span></div>
      <div className="pd-kv"><span className="pd-k">Details</span><span className="pd-v">{cp?.contact ?? '—'}</span></div>
      <p className="pd-contact-note">Arrange and settle directly. Mark the deal complete once done.</p>
      {!done && <button className="pd-btn-block" disabled={busy} onClick={onComplete}>Mark deal complete</button>}
    </div>
  );
}
