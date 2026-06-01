import { useEffect, useState } from 'react';
import { api, ApiError } from '../api.js';
import { AssetSelect, fmtAmount, Icon, OrderCard, RateChip, Stepper } from '../components.js';
import { haptic } from '../tg.js';
import { ASSETS, type Asset, PAYMENT_METHODS } from '../types.js';
import type { Order } from '../types.js';

interface OptDraft {
  asset: Asset;
  max_rate: string;
  payment_methods: string[];
}

const METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Bank', cash: 'Cash', TRC20: 'TRC20', ERC20: 'ERC20', TON: 'TON', other: 'Other',
};
const GLYPH: Record<string, string> = { EUR: '€', RUB: '₽', USDT: '₮' };

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
    setOpts((prev) => prev.map((o, idx) =>
      idx === i ? { ...o, payment_methods: o.payment_methods.includes(m) ? o.payment_methods.filter((x) => x !== m) : [...o.payment_methods, m] } : o));
  }
  function addOpt() {
    const free = availFor(opts.length);
    if (free.length === 0) return;
    setOpts((p) => [...p, { asset: free[0]!, max_rate: '', payment_methods: [] }]);
  }

  const amountValid = /^\d+(\.\d+)?$/.test(wantAmount) && Number.parseFloat(wantAmount) > 0;

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const order = await api.post<{ id: number }>('/orders', {
        want_asset: wantAsset, want_amount: wantAmount,
        location_city: city.trim() || null, comment: comment.trim() || null,
        give_options: opts.map((o) => ({ asset: o.asset, max_rate: o.max_rate.trim() || null, payment_methods: o.payment_methods })),
      });
      haptic('success');
      onCreated(order.id);
    } catch (e) {
      haptic('error');
      setErr(e instanceof ApiError ? e.message : (e as Error).message);
    } finally { setBusy(false); }
  }

  const previewOrder: Order = {
    id: 0, want_asset: wantAsset, want_amount: wantAmount || '0', status: 'active',
    location_city: city || null, location_country: null, comment: null,
    created_by_user_id: 0, created_at: new Date().toISOString(), expires_at: null,
    give_options: opts.map((o, i) => ({
      id: i, asset: o.asset, max_rate: o.max_rate || null, payment_methods: o.payment_methods,
      reference_rate: null, reference_source: null, delta_percent: null,
    })),
    maker: null,
  };

  return (
    <div className="pd-page">
      <div className="pd-page-head">
        <h1 className="pd-h1">New request</h1>
        <Stepper step={step} total={3} />
      </div>

      {step === 1 && (
        <div className="pd-form-multi">
          <div className="pd-form-section">
            <div className="pd-form-section-head">
              <span className="pd-form-n pd-num">1</span>
              <span className="pd-form-title">I want to receive</span>
            </div>
            <AssetSelect value={wantAsset} onChange={(a) => {
              setWantAsset(a);
              setOpts((p) => p.map((o) => o.asset === a ? { ...o, asset: availFor(0)[0] ?? o.asset } : o));
            }} />
            <span className="pd-label">Amount</span>
            <div className="pd-amount-field">
              <span className="pd-amount-glyph">{GLYPH[wantAsset]}</span>
              <input className="pd-input pd-input-amount pd-num" inputMode="decimal" placeholder="1000"
                value={wantAmount} onChange={(e) => setWantAmount(e.target.value)} />
              <span className="pd-amount-code">{wantAsset}</span>
            </div>
            <span className="pd-label">City <span className="pd-label-opt">· optional</span></span>
            <div className="pd-field">
              <Icon name="pin" size={16} cls="pd-field-ic" />
              <input className="pd-input" placeholder="e.g. Bar" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
          </div>
          <button className="pd-btn-block" disabled={!amountValid} onClick={() => setStep(2)}>Continue</button>
        </div>
      )}

      {step === 2 && (
        <div className="pd-form-multi">
          <div className="pd-form-section">
            <div className="pd-form-section-head">
              <span className="pd-form-n pd-num">2</span>
              <span className="pd-form-title">I will give — one of these</span>
            </div>
            <p className="pd-form-sub">Add the assets you can pay with. Rate is optional; we'll show how it compares to CBR.</p>
            <div className="pd-give-editors">
              {opts.map((o, i) => (
                <div className="pd-give-editor" key={i}>
                  <div className="pd-row pd-give-editor-head">
                    <div className="pd-segmini">
                      {[o.asset, ...availFor(i)].filter((v, idx, arr) => arr.indexOf(v) === idx).map((a) => (
                        <button key={a} type="button"
                          className={`pd-segmini-opt${o.asset === a ? ' is-on' : ''}`}
                          onClick={() => updateOpt(i, { asset: a as Asset })}>
                          {a}
                        </button>
                      ))}
                    </div>
                    <span className="pd-spacer" />
                    {opts.length > 1 && <button className="pd-btn-ghost-sm" onClick={() => setOpts((p) => p.filter((_, idx) => idx !== i))}>Remove</button>}
                  </div>
                  <span className="pd-label">Max rate <span className="pd-label-opt">· {o.asset}/{wantAsset} · optional</span></span>
                  <input className="pd-input pd-num" inputMode="decimal"
                    placeholder="e.g. 99"
                    value={o.max_rate} onChange={(e) => updateOpt(i, { max_rate: e.target.value })} />
                  <RatePreview base={wantAsset} quote={o.asset} userRate={o.max_rate} />
                  <span className="pd-label">Payment methods</span>
                  <div className="pd-chips pd-chips-wrap" style={{ marginTop: 4 }}>
                    {PAYMENT_METHODS.map((m) => (
                      <button key={m} type="button"
                        className={`pd-chip pd-chip-sm${o.payment_methods.includes(m) ? ' is-on' : ''}`}
                        onClick={() => toggleMethod(i, m)}>
                        {METHOD_LABELS[m] ?? m}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {opts.length < ASSETS.length - 1 && (
              <button className="pd-add-alt" onClick={addOpt}>
                <Icon name="plus" size={16} stroke={2} />Add alternative
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="pd-btn-ghost-sm" style={{ flex: '0 0 auto' }} onClick={() => setStep(1)}>Back</button>
            <button className="pd-btn-block" style={{ marginTop: 0, flex: 1 }} onClick={() => setStep(3)}>Continue</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="pd-form-multi">
          <div className="pd-form-section">
            <div className="pd-form-section-head">
              <span className="pd-form-n pd-num">3</span>
              <span className="pd-form-title">Note & preview</span>
            </div>
            <p className="pd-form-sub">Anything that helps a counterparty — timing, area, preferences.</p>
            <textarea className="pd-input" placeholder="e.g. can meet near the marina this evening"
              value={comment} onChange={(e) => setComment(e.target.value)} />
            <div className="pd-preview">
              <span className="pd-preview-tag">Preview</span>
              <OrderCard order={previewOrder} variant="rate" />
            </div>
          </div>
          {err && <p style={{ color: 'var(--pd-far)', fontSize: 13, margin: '0 0 8px' }}>{err}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="pd-btn-ghost-sm" style={{ flex: '0 0 auto' }} onClick={() => setStep(2)}>Back</button>
            <button className="pd-btn-block" style={{ marginTop: 0, flex: 1 }} disabled={busy} onClick={() => void submit()}>
              {busy ? 'Publishing…' : 'Publish request'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RatePreview({ base, quote, userRate }: { base: Asset; quote: Asset; userRate: string }) {
  const [ref, setRef] = useState<number | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancel = false;
    setRef(null); setUnavailable(false);
    api.get<{ rate: number }>(`/rates/reference?base=${base}&quote=${quote}`)
      .then((r) => !cancel && setRef(r.rate))
      .catch(() => !cancel && setUnavailable(true));
    return () => { cancel = true; };
  }, [base, quote]);

  if (unavailable) return <p className="pd-rate-hint">Reference rate unavailable — order can still be published.</p>;
  if (ref == null) return <p className="pd-rate-hint">Loading reference…</p>;

  const ur = Number.parseFloat(userRate);
  const has = Number.isFinite(ur) && ur > 0;
  const delta = has ? ((ur - ref) / ref) * 100 : null;
  return (
    <div className="pd-rate-preview">
      <span className="pd-rate-ref">CBR ≈ <span className="pd-num">{fmtAmount(ref)}</span> {quote}/{base}</span>
      {delta != null && <RateChip delta={delta.toFixed(1)} style="chip" />}
    </div>
  );
}
