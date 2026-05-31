import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Empty, fmtAmount } from '../components.js';
import { haptic } from '../tg.js';
import { ASSETS, type Asset, type Subscription } from '../types.js';

export function Subscriptions() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [want, setWant] = useState<Asset>('EUR');
  const [give, setGive] = useState<Asset[]>([]);
  const [city, setCity] = useState('');
  const [maxRate, setMaxRate] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    api.get<{ subscriptions: Subscription[] }>('/subscriptions').then((r) => setSubs(r.subscriptions)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function create() {
    setBusy(true);
    try {
      await api.post('/subscriptions', {
        want_asset: want,
        give_assets: give,
        location_city: city.trim() || null,
        max_rate: maxRate.trim() || null,
      });
      haptic('success');
      setGive([]); setCity(''); setMaxRate('');
      load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    await api.del(`/subscriptions/${id}`);
    load();
  }

  return (
    <div>
      <h1>Alerts</h1>
      <p className="muted small">Get a Telegram message when a matching order is posted.</p>

      <div className="card stack">
        <div>
          <label>Notify me about orders wanting</label>
          <select value={want} onChange={(e) => setWant(e.target.value as Asset)}>
            {ASSETS.map((a) => <option key={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label>Paid in any of</label>
          <div className="row wrap">
            {ASSETS.filter((a) => a !== want).map((a) => (
              <button type="button" key={a} className={give.includes(a) ? 'pill on' : 'pill'} onClick={() => setGive((p) => (p.includes(a) ? p.filter((x) => x !== a) : [...p, a]))}>
                {a}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label>City (optional)</label>
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Bar" />
        </div>
        <div>
          <label>Max rate (optional)</label>
          <input value={maxRate} onChange={(e) => setMaxRate(e.target.value)} inputMode="decimal" />
        </div>
        <button disabled={busy} onClick={() => void create()}>Create alert</button>
      </div>

      <h2 style={{ marginTop: 20 }}>Your alerts</h2>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : subs.length === 0 ? (
        <Empty text="No alerts yet." />
      ) : (
        subs.map((s) => (
          <div className="card" key={s.id}>
            <div className="row">
              <span>wants <strong>{s.want_asset}</strong>{s.give_assets.length ? ` · pays ${s.give_assets.join('/')}` : ''}</span>
              <span className="spacer" />
              <button className="ghost" onClick={() => void remove(s.id)}>Delete</button>
            </div>
            <div className="muted small">
              {s.location_city ? `${s.location_city} · ` : ''}{s.max_rate ? `max rate ${fmtAmount(s.max_rate)} · ` : ''}{s.is_active ? 'active' : 'paused'}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
