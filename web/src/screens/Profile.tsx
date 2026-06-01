import { useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../components.js';
import { haptic } from '../tg.js';
import { type Me, PAYMENT_METHODS } from '../types.js';

const METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Bank', cash: 'Cash', TRC20: 'TRC20', ERC20: 'ERC20', TON: 'TON', other: 'Other',
};

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
    setBusy(true); setMsg(null);
    try {
      await api.patch('/me', { display_name: displayName, city, country, preferred_payment_methods: methods, phone, contact });
      haptic('success'); setMsg('Saved.'); onSaved();
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }

  const initial = (me.profile.display_name || me.username || 'U').slice(0, 1).toUpperCase();
  const name = me.profile.display_name || (me.username ? `@${me.username}` : `User ${me.telegram_id}`);

  return (
    <div className="pd-page">
      <h1 className="pd-h1">Profile</h1>

      <div className="pd-profile-card">
        <span className="pd-avatar pd-avatar-lg">{initial}</span>
        <div className="pd-profile-id">
          <span className="pd-profile-name">
            {name}
            {me.username && <span className="pd-profile-handle">@{me.username}</span>}
          </span>
          <span className="pd-profile-rating">
            <Icon name="star" size={14} fill cls="pd-star" />
            <span className="pd-num">{p.rating_score}</span>
            <span className="pd-dot-sep">·</span>
            <span className="pd-num">{p.completed_deals_count}</span>&nbsp;deals
          </span>
        </div>
        <span className="pd-role-tag">{me.super_admin ? 'admin' : me.role.replace('_', ' ')}</span>
      </div>

      <div className="pd-stat-row">
        <div className="pd-stat">
          <span className="pd-stat-num pd-num">{p.completed_deals_count}</span>
          <span className="pd-stat-label">Completed</span>
        </div>
        <div className="pd-stat">
          <span className="pd-stat-num pd-num">{Number(p.rating_score).toFixed(1)}</span>
          <span className="pd-stat-label">Rating</span>
        </div>
      </div>

      <span className="pd-label">Display name</span>
      <input className="pd-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <span className="pd-label">City</span>
          <input className="pd-input" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <span className="pd-label">Country</span>
          <input className="pd-input" value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>
      </div>

      <span className="pd-label">Preferred payment methods</span>
      <div className="pd-chips pd-chips-wrap" style={{ marginTop: 4 }}>
        {PAYMENT_METHODS.map((m) => (
          <button type="button" key={m}
            className={`pd-chip pd-chip-sm${methods.includes(m) ? ' is-on' : ''}`}
            onClick={() => setMethods((p2) => p2.includes(m) ? p2.filter((x) => x !== m) : [...p2, m])}>
            {METHOD_LABELS[m] ?? m}
          </button>
        ))}
      </div>

      <div className="pd-note" style={{ marginTop: 20 }}>
        <span className="pd-note-label">
          <Icon name="shield" size={14} fill cls="pd-good-ic" /> Contact privacy
        </span>
        <p className="pd-note-body">
          Your phone and contact details are shared with a counterparty <strong>only</strong> after a deal is accepted — never shown in the public order book.
        </p>
      </div>

      <span className="pd-label">Phone</span>
      <input className="pd-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+382 …" />

      <span className="pd-label">Other contact / requisites</span>
      <textarea className="pd-input" value={contact} onChange={(e) => setContact(e.target.value)}
        placeholder="@handle, bank/wallet details to share on a match" />

      {msg && <p style={{ fontSize: 13, color: msg === 'Saved.' ? 'var(--pd-good)' : 'var(--pd-far)', margin: '8px 0' }}>{msg}</p>}
      <button className="pd-btn-block" disabled={busy} onClick={() => void save()}>
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
