import { useState } from 'react';
import { api } from '../api.js';
import { haptic } from '../tg.js';

export function Disclaimer({ onAccepted }: { onAccepted: () => void }) {
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    try {
      await api.post('/me/accept-disclaimer');
      haptic('success');
      onAccepted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content">
      <h1>Welcome to PairDesk</h1>
      <div className="card disclaimer">
        <p>
          <strong>PairDesk is a private bulletin board</strong> for P2P exchange requests between
          members of this community. Before you continue, understand what PairDesk is and is not:
        </p>
        <ul>
          <li>It does <strong>not</strong> custody funds, process payments, or hold balances.</li>
          <li>It does <strong>not</strong> provide financial services or guarantee any rate.</li>
          <li>It is <strong>not</strong> a party to any transaction and provides no escrow.</li>
          <li>All arrangements and settlement happen <strong>directly between members</strong>, at their own risk.</li>
        </ul>
        <p className="muted">
          You are responsible for verifying your counterparty and completing any exchange yourself.
        </p>
      </div>
      <button onClick={() => void accept()} disabled={busy} style={{ width: '100%' }}>
        {busy ? 'Saving…' : 'I understand and agree'}
      </button>
    </div>
  );
}
