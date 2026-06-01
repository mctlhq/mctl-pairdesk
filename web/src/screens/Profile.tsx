import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../components.js';
import { hasMainButton, hapticError, hapticSelection, hapticSuccess, setMainButton, showBackButton } from '../tg.js';
import { type Me, PAYMENT_METHODS } from '../types.js';
import { Admin } from './Admin.js';
import { Subscriptions } from './Subscriptions.js';

const METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Bank', cash: 'Cash', TRC20: 'TRC20', ERC20: 'ERC20', TON: 'TON', other: 'Other',
};

type ProfileView = 'main' | 'alerts' | 'admin';

export function Profile({ me, canAdmin, onSaved }: { me: Me; canAdmin: boolean; onSaved: () => void }) {
  const p = me.profile;
  const [view, setView] = useState<ProfileView>('main');
  const [displayName, setDisplayName] = useState(p.display_name ?? '');
  const [city, setCity] = useState(p.city ?? '');
  const [country, setCountry] = useState(p.country ?? '');
  const [methods, setMethods] = useState<string[]>(p.preferred_payment_methods ?? []);
  const [phone, setPhone] = useState(p.phone ?? '');
  const [contact, setContact] = useState(p.contact ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [members, setMembers] = useState<number | null>(null);

  useEffect(() => {
    api.get<{ members: number }>('/community/stats').then((r) => setMembers(r.members)).catch(() => {});
  }, []);

  const save = useCallback(async () => {
    setBusy(true); setMsg(null);
    try {
      await api.patch('/me', { display_name: displayName, city, country, preferred_payment_methods: methods, phone, contact });
      hapticSuccess(); setMsg('Saved.'); onSaved();
    } catch (e) { hapticError(); setMsg((e as Error).message); }
    finally { setBusy(false); }
  }, [city, contact, country, displayName, methods, onSaved, phone]);

  useEffect(() => {
    if (view === 'main') return undefined;
    return showBackButton(() => setView('main'));
  }, [view]);

  useEffect(() => {
    if (view !== 'main') return undefined;
    return setMainButton({
      text: busy ? 'Saving...' : 'Save',
      enabled: !busy,
      loading: busy,
      onClick: () => { void save(); },
    });
  }, [busy, save, view]);

  if (view === 'alerts') {
    return <Subscriptions />;
  }
  if (view === 'admin' && canAdmin) {
    return <Admin />;
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

      {members != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--pd-hint)', marginBottom: 16 }}>
          <Icon name="user" size={14} cls="pd-mut-ic" />
          Member of a community of <span className="pd-num" style={{ fontWeight: 700, color: 'var(--pd-text-2)' }}>{members}</span> trusted traders
        </div>
      )}

      <div className="pd-profile-links" aria-label="Profile sections">
        <button type="button" className="pd-profile-link" onClick={() => { hapticSelection(); setView('alerts'); }}>
          <span className="pd-profile-link-ic"><Icon name="bell" size={17} /></span>
          <span>
            <span className="pd-profile-link-title">Alerts</span>
            <span className="pd-profile-link-sub">Matching order notifications</span>
          </span>
          <Icon name="chevron" size={16} cls="pd-chev" />
        </button>
        {canAdmin && (
          <button type="button" className="pd-profile-link" onClick={() => { hapticSelection(); setView('admin'); }}>
            <span className="pd-profile-link-ic"><Icon name="shield" size={17} /></span>
            <span>
              <span className="pd-profile-link-title">Admin</span>
              <span className="pd-profile-link-sub">Moderation and community controls</span>
            </span>
            <Icon name="chevron" size={16} cls="pd-chev" />
          </button>
        )}
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
      {!hasMainButton() && (
        <button className="pd-btn-block" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      )}
    </div>
  );
}
