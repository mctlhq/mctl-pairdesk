import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badge, Empty, fmtAmount, Icon } from '../components.js';
import type { Deal, Me } from '../types.js';

function counterpartyLabel(d: Deal, meId: number): string {
  const isCreator = d.creator_user_id === meId;
  const username  = isCreator ? d.responder_username : d.creator_username;
  const name      = isCreator ? d.responder_name     : d.creator_name;
  if (username) return `@${username}`;
  if (name)     return name;
  return 'member';
}

export function MyDeals({ onOpen, me }: { onOpen: (orderId: number) => void; me: Me }) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ deals: Deal[] }>('/deals').then((r) => setDeals(r.deals)).finally(() => setLoading(false));
  }, []);

  return (
    <div className="pd-page">
      <h1 className="pd-h1">My deals</h1>
      {loading ? (
        <p className="pd-muted-row">Loading…</p>
      ) : deals.length === 0 ? (
        <Empty text="No deals yet. Respond to an order in the book to start one." />
      ) : (
        <div className="pd-list">
          {deals.map((d) => {
            const isAccepted = d.status === 'accepted';
            const isCompleted = d.status === 'completed';
            const cp = counterpartyLabel(d, me.id);
            return (
              <button className="pd-card" key={d.id} onClick={() => onOpen(d.order_id)}>
                {/* Amount + status */}
                <div className="pd-row" style={{ marginBottom: 8 }}>
                  <span className="pd-want-amt pd-num" style={{ fontSize: 17, fontWeight: 700 }}>
                    {fmtAmount(d.want_amount)} {d.want_asset}
                  </span>
                  <span className="pd-spacer" />
                  <Badge status={d.status} />
                </div>

                {/* Counterparty + location */}
                <div className="pd-row" style={{ gap: 6, fontSize: 13, color: 'var(--pd-text-2)', marginBottom: 6 }}>
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

                {/* Status hint */}
                {isAccepted && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--pd-good)', fontWeight: 600 }}>
                    <Icon name="check" size={13} />
                    Contacts available — tap to view and arrange exchange
                  </div>
                )}
                {isCompleted && (
                  <div style={{ fontSize: 12, color: 'var(--pd-hint)' }}>Deal completed</div>
                )}
                {!isAccepted && !isCompleted && (
                  <div style={{ fontSize: 12, color: 'var(--pd-hint)' }}>
                    {d.status === 'requested' ? 'Waiting for maker to review' : d.status}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
