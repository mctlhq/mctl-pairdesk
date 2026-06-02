import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { AssetSelect, Empty, fmtAmount, Icon } from '../components.js';
import { hapticError, hapticSelection, hapticSuccess, scrollFieldIntoView } from '../tg.js';
import { ASSETS, type Asset, type Subscription } from '../types.js';

export function Subscriptions() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [want, setWant] = useState<Asset>('EUR');
  const [give, setGive] = useState<Asset[]>([]);
  const [city, setCity] = useState('');
  const [maxRate, setMaxRate] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function load() {
    api.get<{ subscriptions: Subscription[] }>('/subscriptions')
      .then((r) => setSubs(r.subscriptions))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function create() {
    setBusy(true);
    setErr(null);
    try {
      await api.post('/subscriptions', {
        want_asset: want, give_assets: give,
        location_city: city.trim() || null, max_rate: maxRate.trim() || null,
      });
      hapticSuccess();
      setGive([]); setCity(''); setMaxRate('');
      load();
    } catch (e) {
      hapticError();
      setErr((e as Error).message);
    } finally { setBusy(false); }
  }

  async function remove(id: number) {
    await api.del(`/subscriptions/${id}`);
    hapticSuccess();
    load();
  }

  return (
    <div className="pd-page">
      <h1 className="pd-h1">Alerts</h1>
      <p className="pd-sub">Get a Telegram message when a matching order is posted.</p>

      <div className="pd-form-section">
        <span className="pd-label">Notify me about orders wanting</span>
        <AssetSelect value={want} onChange={(a) => { hapticSelection(); setWant(a); setGive((g) => g.filter((x) => x !== a)); }} />

        <span className="pd-label">Paid in any of</span>
        <div className="pd-chips pd-chips-wrap">
          {ASSETS.filter((a) => a !== want).map((a) => (
            <button key={a} type="button"
              className={`pd-chip${give.includes(a) ? ' is-on' : ''}`}
              onClick={() => { hapticSelection(); setGive((p) => p.includes(a) ? p.filter((x) => x !== a) : [...p, a]); }}>
              {a}
            </button>
          ))}
        </div>

        <span className="pd-label">City <span className="pd-label-opt">· optional</span></span>
        <label className="pd-field">
          <Icon name="pin" size={16} cls="pd-field-ic" />
          <input className="pd-input" inputMode="text" placeholder="e.g. Bar" value={city}
            onChange={(e) => setCity(e.target.value)}
            onFocus={(e) => scrollFieldIntoView(e.currentTarget)} />
        </label>

        <span className="pd-label">Max rate <span className="pd-label-opt">· optional</span></span>
        <input className="pd-input" inputMode="decimal" value={maxRate} onChange={(e) => setMaxRate(e.target.value)}
          onFocus={(e) => scrollFieldIntoView(e.currentTarget)} />

        {err && <p style={{ color: 'var(--pd-far)', fontSize: 13, margin: '8px 0 0' }}>{err}</p>}
        <button className="pd-btn-block" disabled={busy} onClick={() => void create()}>
          <Icon name="bell" size={17} />Create alert
        </button>
      </div>

      <h2 className="pd-h2">Your alerts</h2>
      {loading ? (
        <p className="pd-muted-row">Loading…</p>
      ) : subs.length === 0 ? (
        <Empty text="No alerts yet." />
      ) : (
        <div className="pd-list">
          {subs.map((s) => (
            <div className="pd-alert-row" key={s.id}>
              <span className="pd-alert-pair">
                <span>{s.want_asset}</span>
                <Icon name="arrowSwap" size={15} cls="pd-mut-ic" />
                <span>{s.give_assets.join(' / ') || 'any'}</span>
              </span>
              <div style={{ flex: 1 }}>
                <div className="pd-alert-meta">
                  {s.location_city ? `${s.location_city} · ` : 'anywhere · '}
                  {s.max_rate ? `≤ ${fmtAmount(s.max_rate)} · ` : ''}
                  <span style={{ color: s.is_active ? 'var(--pd-good)' : 'var(--pd-hint)' }}>
                    {s.is_active ? 'active' : 'paused'}
                  </span>
                </div>
              </div>
              <button className="pd-iconbtn" onClick={() => void remove(s.id)} aria-label="Remove alert">
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
