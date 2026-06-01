import { Icon } from '../components.js';
import type { Me } from '../types.js';

export function Pending({ me, onRefresh }: { me: Me; onRefresh: () => void }) {
  const copy: Record<string, { title: string; body: string; icon: string }> = {
    pending:  { title: 'Awaiting approval', body: 'Your request to join has been sent to an admin. You will get a message here once approved.', icon: 'clock' },
    rejected: { title: 'Access not granted', body: 'An admin did not approve your request. Contact the community if you believe this is a mistake.', icon: 'close' },
    blocked:  { title: 'Access blocked',     body: 'Your access to this community has been blocked.', icon: 'close' },
  };
  const c = copy[me.status] ?? copy.pending!;
  return (
    <div className="pd-center">
      <div className="pd-empty-mark">
        <Icon name={c.icon} size={26} />
      </div>
      <h2 style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 700 }}>{c.title}</h2>
      <p style={{ color: 'var(--pd-hint)', margin: 0, fontSize: 14, lineHeight: 1.5, maxWidth: 260, textAlign: 'center' }}>{c.body}</p>
      {me.status === 'pending' && (
        <button
          style={{ padding: '10px 24px', borderRadius: 12, border: '1.5px solid var(--pd-border)', background: 'transparent', color: 'var(--pd-text)', font: 'inherit', fontWeight: 600, cursor: 'pointer', marginTop: 4 }}
          onClick={onRefresh}
        >Check again</button>
      )}
    </div>
  );
}
