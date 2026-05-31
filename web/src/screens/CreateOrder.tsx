import { useEffect, useState } from 'react';
import { api, ApiError } from '../api.js';
import { fmtAmount } from '../components.js';
import { haptic } from '../tg.js';
import { ASSETS, type Asset, PAYMENT_METHODS } from '../types.js';

interface OptDraft {
  asset: Asset;
  max_rate: string;
  payment_methods: string[];
}

export function CreateOrder({ onCreated }: { onCreated: (id: number) => void }) {
  const [step, setStep] = useState(1);
  const [wantAsset, setWantAsset] = useState<Asset>('EUR');
  const [wantAmount, setWantAmount] = useState('');
  const [city, setCity] = useState('');
  const [comment, setComment] = useState('');
  const [opts, setOpts] = useState<OptDraft[]>([{ asset: 'RUB', max_rate: '', payment_methods: [] }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const availFor = (idx: number): Asset[] =>
    ASSETS.filter((a) => a !== wantAsset && !opts.some((o, i) => i !== idx && o.asset === a));

  function updateOpt(i: number, patch: Partial<OptDraft>) {
    setOpts((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }
  function toggleMethod(i: number, m: string) {
    setOpts((prev) =>
      prev.map((o, idx) =>
        idx === i ? { ...o, payment_methods: o.payment_methods.includes(m) ? o.payment_methods.filter((x) => x !== m) : [...o.payment_methods, m] } : o,
      ),
    );
  }
  function addOpt() {
    const free = availFor(opts.length);
    if (free.length === 0) return;
    setOpts((p) => [...p, { asset: free[0]!, max_rate: '', payment_methods: [] }]);
  }

  const amountValid = /^\d+(\.\d+)?$/.test(wantAmount) && Number.parseFloat(wantAmount) > 0;

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const order = await api.post<{ id: number }>('/orders', {
        want_asset: wantAsset,
        want_amount: wantAmount,
        location_city: city.trim() || null,
        comment: comment.trim() || null,
        give_options: opts.map((o) => ({
          asset: o.asset,
          max_rate: o.max_rate.trim() ? o.max_rate.trim() : null,
          payment_methods: o.payment_methods,
        })),
      });
      haptic('success');
      onCreated(order.id);
    } catch (e) {
      haptic('error');
      setErr(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>New request</h1>
      <p className="muted small">Step {step} of 2</p>

      {step === 1 && (
        <div className="stack">
          <div>
            <label>I want to receive</label>
            <select value={wantAsset} onChange={(e) => setWantAsset(e.target.value as Asset)}>
              {ASSETS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label>Amount</label>
            <input value={wantAmount} onChange={(e) => setWantAmount(e.target.value)} inputMode="decimal" placeholder="1000" />
          </div>
          <div>
            <label>City (optional)</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Bar" />
          </div>
          <button disabled={!amountValid} onClick={() => { setOpts((p) => p.map((o) => (o.asset === wantAsset ? { ...o, asset: availFor(0)[0] ?? o.asset } : o))); setStep(2); }}>
            Next
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          <label>I will give (one of these alternatives)</label>
          {opts.map((o, i) => (
            <div className="card" key={i}>
              <div className="row">
                <select value={o.asset} onChange={(e) => updateOpt(i, { asset: e.target.value as Asset })} style={{ flex: 1 }}>
                  {[o.asset, ...availFor(i)].filter((v, idx, arr) => arr.indexOf(v) === idx).map((a) => <option key={a}>{a}</option>)}
                </select>
                {opts.length > 1 && <button className="ghost" onClick={() => setOpts((p) => p.filter((_, idx) => idx !== i))}>Remove</button>}
              </div>
              <label>Max rate ({o.asset} per {wantAsset}) — optional</label>
              <input value={o.max_rate} onChange={(e) => updateOpt(i, { max_rate: e.target.value })} inputMode="decimal" placeholder="e.g. 99" />
              <RatePreview base={wantAsset} quote={o.asset} userRate={o.max_rate} />
              <label>Payment methods</label>
              <div className="row wrap">
                {PAYMENT_METHODS.map((m) => (
                  <button type="button" key={m} className={o.payment_methods.includes(m) ? 'pill on' : 'pill'} onClick={() => toggleMethod(i, m)}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {opts.length < ASSETS.length - 1 && <button className="secondary" onClick={addOpt}>+ Add alternative</button>}

          <label>Note (optional)</label>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. can meet this evening" />

          {err && <p className="error">{err}</p>}
          <div className="row">
            <button className="secondary" onClick={() => setStep(1)}>Back</button>
            <button style={{ flex: 1 }} disabled={busy} onClick={() => void submit()}>{busy ? 'Publishing…' : 'Publish request'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Live CBR reference + deviation for one give option. */
function RatePreview({ base, quote, userRate }: { base: Asset; quote: Asset; userRate: string }) {
  const [ref, setRef] = useState<number | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancel = false;
    setRef(null);
    setUnavailable(false);
    api
      .get<{ rate: number }>(`/rates/reference?base=${base}&quote=${quote}`)
      .then((r) => !cancel && setRef(r.rate))
      .catch(() => !cancel && setUnavailable(true));
    return () => { cancel = true; };
  }, [base, quote]);

  if (unavailable) return <p className="muted small">Reference rate unavailable — order can still be published.</p>;
  if (ref == null) return <p className="muted small">Loading reference…</p>;

  const ur = Number.parseFloat(userRate);
  const hasRate = Number.isFinite(ur) && ur > 0;
  const delta = hasRate ? ((ur - ref) / ref) * 100 : null;
  const big = delta != null && Math.abs(delta) > 10;
  return (
    <p className={`small ${big ? 'neg' : 'muted'}`}>
      CBR reference ≈ {fmtAmount(ref)} {quote}/{base}
      {delta != null && ` · your rate is ${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}
      {big && ' — far from market, may be flagged'}
    </p>
  );
}
