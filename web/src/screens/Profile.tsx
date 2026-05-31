import { useState } from 'react';
import { api } from '../api.js';
import { haptic } from '../tg.js';
import { type Me, PAYMENT_METHODS } from '../types.js';

export function Profile({ me, onSaved }: { me: Me; onSaved: () => void }) {
  const p = me.profile;
  const [displayName, setDisplayName] = useState(p.display_name ?? '');
  const [city, setCity] = useState(p.city ?? '');
  const [country, setCountry] = useState(p.country ?? '');
  const [methods, setMethods] = useState<string[]>(p.preferred_payment_methods ?? []);
  const [phone, setPhone] = useState(p.phone ?? '');
  const [contact, setContact] = useState(p.contact ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api.patch('/me', {
        display_name: displayName,
        city,
        country,
        preferred_payment_methods: methods,
        phone,
        contact,
      });
      haptic('success');
      setMsg('Saved.');
      onSaved();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>Profile</h1>
      <div className="card">
        <div className="kv"><span className="k">Telegram</span><span>{me.username ? `@${me.username}` : me.telegram_id}</span></div>
        <div className="kv"><span className="k">Role</span><span>{me.super_admin ? 'admin (super)' : me.role}</span></div>
        <div className="kv"><span className="k">Completed deals</span><span>{p.completed_deals_count}</span></div>
        <div className="kv"><span className="k">Rating</span><span>{p.rating_score}</span></div>
      </div>

      <label>Display name</label>
      <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      <div className="row">
        <div style={{ flex: 1 }}>
          <label>City</label>
          <input value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label>Country</label>
          <input value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>
      </div>

      <label>Preferred payment methods</label>
      <div className="row wrap">
        {PAYMENT_METHODS.map((m) => (
          <button type="button" key={m} className={methods.includes(m) ? 'pill on' : 'pill'} onClick={() => setMethods((p2) => (p2.includes(m) ? p2.filter((x) => x !== m) : [...p2, m]))}>
            {m}
          </button>
        ))}
      </div>

      <h2 style={{ marginTop: 20 }}>Contact details</h2>
      <p className="muted small">
        Private. Shared with a counterparty <strong>only</strong> after you accept (or are accepted on) a deal —
        never shown in the public order book.
      </p>
      <label>Phone</label>
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+382 …" />
      <label>Other contact / requisites</label>
      <textarea value={contact} onChange={(e) => setContact(e.target.value)} placeholder="@handle, bank/wallet details to share on a match" />

      {msg && <p className={msg === 'Saved.' ? 'pos' : 'error'}>{msg}</p>}
      <button style={{ width: '100%', marginTop: 12 }} disabled={busy} onClick={() => void save()}>
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
