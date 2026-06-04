import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api.js';
import { Badge, fmtAmount, GiveRow, Icon, Maker, PD_GLYPH } from '../components.js';
import { confirmAction, hasMainButton, hapticError, hapticSuccess, setMainButton, showBackButton } from '../tg.js';
import type { Deal, Me, Order } from '../types.js';

export function OrderDetail({ orderId, me, onBack }: { orderId: number; me: Me; onBack: () => void }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [o, d] = await Promise.all([
      api.get<Order>(`/orders/${orderId}`),
      api.get<{ deals: Deal[] }>(`/orders/${orderId}/deals`),
    ]);
    setOrder(o);
    setDeals(d.deals);
  }, [orderId]);

  // Initial fetch needs its own error path — a failed first load would otherwise
  // leave the screen stuck on "Loading…" with no way out. run() only covers actions.
  const loadInitial = useCallback(() => {
    setLoadErr(null);
    load().catch((e) => setLoadErr(e instanceof ApiError ? e.message : (e as Error).message));
  }, [load]);

  useEffect(() => { loadInitial(); }, [loadInitial]);
  useEffect(() => showBackButton(onBack), [onBack]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try {
      await fn();
      hapticSuccess();
      setMsg(ok);
      await load();
    } catch (e) {
      hapticError();
      setMsg(e instanceof ApiError ? e.message : (e as Error).message);
    } finally { setBusy(false); }
  }

  const isMaker = order ? me.id === order.created_by_user_id : false;
  const myDeal = deals.find((d) => d.responder_user_id === me.id);
  const canRespond = Boolean(order && !isMaker && !myDeal && order.status === 'active');
  const respond = useCallback(() => {
    if (!order) return;
    void run(() => api.post(`/orders/${order.id}/respond`), 'Response sent — the maker will review it.');
  }, [order?.id]);

  useEffect(() => {
    if (!canRespond) return undefined;
    return setMainButton({
      text: busy ? 'Sending...' : 'Respond to order',
      enabled: !busy,
      loading: busy,
      onClick: respond,
    });
  }, [busy, canRespond, respond]);

  if (!order) {
    return (
      <div className="pd-content">
        {loadErr ? (
          <>
            <div className="pd-state-card pd-state-error">
              <Icon name="close" size={18} />
              <span>{loadErr}</span>
            </div>
            <button className="pd-btn-ghost-sm" style={{ width: '100%', marginTop: 12, justifyContent: 'center' }} onClick={loadInitial}>
              Retry
            </button>
          </>
        ) : (
          <p className="pd-muted-row">Loading…</p>
        )}
      </div>
    );
  }

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
          <span className="pd-verified"><Icon name="shield" size={14} fill />Trusted</span>
        </div>
      )}

      <div className="pd-section">
        <div className="pd-section-head">
          <span>Will give — one of</span>
          <span className="pd-section-note">Market ref.</span>
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
              {!hasMainButton() && (
                <button className="pd-btn-block" disabled={busy} onClick={respond}>
                  Respond to this order
                </button>
              )}
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
                    <button className="pd-btn-accent-sm" disabled={busy} onClick={() => void (async () => {
                      if (await confirmAction(`Accept ${rLabel}? Contact details will be shared with them and all other responses declined.`)) {
                        await run(() => api.post(`/deals/${d.id}/accept`), 'Accepted — contacts shared.');
                      }
                    })()}>Accept</button>
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
              disabled={busy} onClick={() => void (async () => {
                if (await confirmAction('Cancel this order? Any pending responses will be declined. This cannot be undone.')) {
                  await run(() => api.post(`/orders/${order.id}/cancel`), 'Order cancelled.');
                }
              })()}>
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
  // Parent passes a fresh onComplete arrow each render; hold the latest in a ref
  // so the MainButton effect depends only on real state, not the closure identity.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  useEffect(() => { api.get<Deal>(`/deals/${dealId}`).then(setDeal).catch(() => setDeal(null)); }, [dealId]);
  useEffect(() => {
    if (done || !deal?.contacts_revealed) return undefined;
    return setMainButton({
      text: busy ? 'Completing...' : 'Mark complete',
      enabled: !busy,
      loading: busy,
      onClick: () => onCompleteRef.current(),
    });
  }, [busy, deal?.contacts_revealed, done]);
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
      {!done && !hasMainButton() && <button className="pd-btn-block" disabled={busy} onClick={onComplete}>Mark deal complete</button>}
    </div>
  );
}
