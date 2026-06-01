import { useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../components.js';
import { hapticError, hapticSuccess } from '../tg.js';

export function Disclaimer({ onAccepted }: { onAccepted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setErr(null);
    try {
      await api.post('/me/accept-disclaimer');
      hapticSuccess();
      onAccepted();
    } catch (e) {
      hapticError();
      setErr((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="pd-center" style={{ alignItems: 'stretch', maxWidth: 420, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 20, alignItems: 'center' }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(150deg,#2f6bf6,#1b3a6b)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
          <Icon name="arrowSwap" size={26} stroke={2} cls="" />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>Welcome to PairDesk</h1>
        <p style={{ fontSize: 13, color: 'var(--pd-hint)', margin: 0, textAlign: 'center' }}>Private P2P exchange-request board</p>
      </div>

      <div className="pd-note" style={{ textAlign: 'left' }}>
        <span className="pd-note-label">Before you continue</span>
        <p className="pd-note-body"><strong>PairDesk is a private bulletin board</strong> for P2P exchange requests between members of this community.</p>
        <ul style={{ paddingLeft: 18, margin: '8px 0 0', fontSize: 13, lineHeight: 1.7 }}>
          <li>It does <strong>not</strong> custody funds, process payments, or hold balances.</li>
          <li>It does <strong>not</strong> provide financial services or guarantee any rate.</li>
          <li>It is <strong>not</strong> a party to any transaction — no escrow, no guarantee.</li>
          <li>All arrangements and settlement happen <strong>directly between members</strong>, at their own risk.</li>
        </ul>
      </div>

      <div className="pd-safety" style={{ marginTop: 8 }}>
        <Icon name="shield" size={15} cls="pd-mut-ic" />
        <span>You are responsible for verifying your counterparty and completing any exchange yourself.</span>
      </div>

      {err && <p style={{ color: 'var(--pd-far)', fontSize: 13, margin: 0 }}>{err}</p>}
      <button className="pd-btn-block" onClick={() => void accept()} disabled={busy}>
        {busy ? 'Saving…' : 'I understand and agree'}
      </button>
    </div>
  );
}
