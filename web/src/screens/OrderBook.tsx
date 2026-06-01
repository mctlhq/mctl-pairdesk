import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Empty, Icon, OrderCard } from '../components.js';
import { hapticSelection } from '../tg.js';
import { ASSETS, type Asset, type Order } from '../types.js';

export function OrderBook({ onOpen }: { onOpen: (id: number) => void }) {
  const [want, setWant] = useState<Asset | ''>('');
  const [give, setGive] = useState<Asset | ''>('');
  const [city, setCity] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [members, setMembers] = useState<number | null>(null);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loadMoreErr, setLoadMoreErr] = useState<string | null>(null);
  const latestSeq = useRef(0);

  function fetchOrders(before?: number, append = false) {
    const seq = ++latestSeq.current;
    // Clear the relevant error up front so a retry shows skeletons/list, not the
    // stale error card. A paginate (append) failure must not replace the list.
    if (append) setLoadMoreErr(null); else setErr(null);
    const qs = new URLSearchParams();
    if (want) qs.set('want_asset', want);
    if (give) qs.set('give_asset', give);
    if (city.trim()) qs.set('location_city', city.trim());
    if (before != null) qs.set('before', String(before));
    return api
      .get<{ orders: Order[]; next_cursor: number | null }>(`/orders?${qs.toString()}`)
      .then((r) => {
        if (seq !== latestSeq.current) return;
        setOrders((prev) => append ? [...prev, ...r.orders] : r.orders);
        setNextCursor(r.next_cursor);
      })
      .catch((e) => {
        if (seq !== latestSeq.current) return;
        if (append) setLoadMoreErr((e as Error).message);
        else setErr((e as Error).message);
      });
  }

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      setNextCursor(null);
      fetchOrders().finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want, give, city]);

  useEffect(() => {
    api.get<{ members: number }>('/community/stats')
      .then((r) => setMembers(r.members))
      .catch(() => {});
  }, []);

  function loadMore() {
    if (nextCursor == null) return;
    setLoadingMore(true);
    fetchOrders(nextCursor, true).finally(() => setLoadingMore(false));
  }

  return (
    <div className="pd-page">
      <div className="pd-page-head">
        <h1 className="pd-h1">Order book</h1>
        <span className="pd-result-count">
          {!loading && <><span className="pd-num">{orders.length}</span> open</>}
          {members != null && (
            <><span className="pd-dot-sep">·</span>
            <Icon name="user" size={12} cls="pd-mut-ic" />
            <span className="pd-num">{members}</span></>
          )}
        </span>
      </div>

      <div className="pd-filters">
        <div className="pd-filter-block">
          <span className="pd-filter-label">Wants</span>
          <div className="pd-chips">
            <button
              className={`pd-chip${want === '' ? ' is-on' : ''}`}
              onClick={() => { hapticSelection(); setWant(''); }}
            >All</button>
            {ASSETS.map((a) => (
              <button
                key={a}
                className={`pd-chip pd-chip-filter${want === a ? ' is-on' : ''}`}
                onClick={() => { hapticSelection(); setWant(want === a ? '' : a); }}
              >{a}</button>
            ))}
          </div>
        </div>

        <div className="pd-filter-block">
          <span className="pd-filter-label">Offers</span>
          <div className="pd-chips">
            <button
              className={`pd-chip${give === '' ? ' is-on' : ''}`}
              onClick={() => { hapticSelection(); setGive(''); }}
            >Any</button>
            {ASSETS.map((a) => (
              <button
                key={a}
                className={`pd-chip pd-chip-filter${give === a ? ' is-on' : ''}`}
                onClick={() => { hapticSelection(); setGive(give === a ? '' : a); }}
              >{a}</button>
            ))}
          </div>
        </div>

        <div className="pd-field pd-field-search">
          <Icon name="pin" size={16} cls="pd-field-ic" />
          <input
            className="pd-input"
            placeholder="City — e.g. Bar, Tbilisi"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
          {city && (
            <button className="pd-field-clear" onClick={() => setCity('')} aria-label="Clear city filter">
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="pd-list">
        {err ? (
          <div className="pd-state-card pd-state-error">
            <Icon name="close" size={18} />
            <span>{err}</span>
          </div>
        ) : loading ? (
          <>
            <div className="pd-skeleton-card" />
            <div className="pd-skeleton-card" />
            <div className="pd-skeleton-card" />
          </>
        ) : orders.length === 0 ? (
          <Empty text="No matching orders. Try widening the filters or create one." />
        ) : (
          <>
            {orders.map((o) => (
              <OrderCard key={o.id} order={o} onOpen={onOpen} variant="outcome" />
            ))}
            {loadMoreErr && (
              <div className="pd-state-card pd-state-error">
                <Icon name="close" size={18} />
                <span>{loadMoreErr}</span>
              </div>
            )}
            {nextCursor != null && (
              <button className="pd-loadmore" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : loadMoreErr ? 'Retry' : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
