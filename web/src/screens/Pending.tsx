import type { Me } from '../types.js';

export function Pending({ me, onRefresh }: { me: Me; onRefresh: () => void }) {
  const copy: Record<string, { title: string; body: string }> = {
    pending: {
      title: 'Awaiting approval',
      body: 'Your request to join has been sent to an admin. You will get a message here once approved.',
    },
    rejected: {
      title: 'Access not granted',
      body: 'An admin did not approve your request. Contact the community if you believe this is a mistake.',
    },
    blocked: {
      title: 'Access blocked',
      body: 'Your access to this community has been blocked.',
    },
  };
  const c = copy[me.status] ?? copy.pending!;
  return (
    <div className="center stack">
      <h2>{c.title}</h2>
      <p className="muted">{c.body}</p>
      {me.status === 'pending' && (
        <button className="secondary" onClick={onRefresh}>
          Check again
        </button>
      )}
    </div>
  );
}
