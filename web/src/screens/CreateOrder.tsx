import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api.js';
import { CurrencyPairPicker, Icon, OrderCard, PD_GLYPH, PD_METHOD_LABEL, RateSlider, Stepper } from '../components.js';
import { hasMainButton, hapticError, hapticSelection, hapticSuccess, scrollFieldIntoView, setMainButton, showBackButton } from '../tg.js';
import { ASSETS, type Asset, PAYMENT_METHODS } from '../types.js';
import type { Order } from '../types.js';

interface OptDraft {
  id: number;       // stable across reorders/removals so RatePreview keeps its state
  asset: Asset;
  max_rate: string;
  payment_methods: string[];
}

export function CreateOrder({ onCreated }: { onCreated: (id: number) => void }) {
  const [step, setStep] = useState(1);
  const [giveAsset, setGiveAsset] = useState<Asset>('RUB');
  const [wantAsset, setWantAsset] = useState<Asset>('EUR');
  const [wantAmount, setWantAmount] = useState('');
  const [city, setCity] = useState('');
  const [comment, setComment] = useState('');
  const [opts, setOpts] = useState<OptDraft[]>(() => [{ id: 0, asset: 'RUB', max_rate: '', payment_methods: [] }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Returns the one asset that is neither exclude1 nor exclude2.
  // Safe for ASSETS = ['EUR', 'RUB', 'USDT'] (three elements, two excluded at most).
  function nextFree(exclude1: Asset, exclude2: Asset): Asset {
    return ASSETS.find((a) => a !== exclude1 && a !== exclude2)!;
  }

  function handleGiveChange(a: Asset) {
    hapticSelection();
    setGiveAsset(a);
    if (a === wantAsset) setWantAsset(nextFree(a, giveAsset));
  }

  function handleWantChange(a: Asset) {
    hapticSelection();
    setWantAsset(a);
    if (a === giveAsset) setGiveAsset(nextFree(a, wantAsset));
  }

  function handleSwap() {
    hapticSelection();
    setGiveAsset(wantAsset);
    setWantAsset(giveAsset);
  }

  // No haptic here: updateOpt also backs the free-text rate input, where a buzz
  // on every keystroke is noise. Discrete callers (asset select) buzz themselves.
  function updateOpt(i: number, patch: Partial<OptDraft>) {
    setOpts((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }
  function toggleMethod(i: number, m: string) {
    hapticSelection();
    setOpts((prev) => prev.map((o, idx) =>
      idx === i ? { ...o, payment_methods: o.payment_methods.includes(m) ? o.payment_methods.filter((x) => x !== m) : [...o.payment_methods, m] } : o));
  }

  const amountValid = /^\d+(\.\d+)?$/.test(wantAmount) && Number.parseFloat(wantAmount) > 0;

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const o = opts[0] ?? { max_rate: '', payment_methods: [] };
      const order = await api.post<{ id: number }>('/orders', {
        want_asset: wantAsset, want_amount: wantAmount,
        location_city: city.trim() || null, comment: comment.trim() || null,
        give_options: [{ asset: giveAsset, max_rate: o.max_rate.trim() || null, payment_methods: o.payment_methods }],
      });
      hapticSuccess();
      onCreated(order.id);
    } catch (e) {
      hapticError();
      setErr(e instanceof ApiError ? e.message : (e as Error).message);
    } finally { setBusy(false); }
  }

  const nextEnabled = step === 1 ? amountValid : step === 2 ? amountValid : !busy;
  const nextText = step === 1 ? 'Continue' : step === 2 ? 'Continue' : (busy ? 'Publishing...' : 'Publish request');

  function primaryAction() {
    if (step === 1) {
      if (!amountValid) { hapticError(); return; }
      hapticSelection();
      setStep(2);
      return;
    }
    if (step === 2) {
      hapticSelection();
      setStep(3);
      return;
    }
    void submit();
  }

  // Hold the latest primaryAction in a ref so the effect can depend only on what
  // changes the button's appearance (text/enabled/loading/step) — not on every
  // keystroke. The stable onClick still calls the freshest closure via the ref.
  const primaryActionRef = useRef(primaryAction);
  primaryActionRef.current = primaryAction;

  useEffect(() => {
    return setMainButton({
      text: nextText,
      enabled: nextEnabled,
      loading: busy,
      onClick: () => primaryActionRef.current(),
    });
  }, [busy, nextEnabled, nextText, step]);

  useEffect(() => {
    if (step === 1) return undefined;
    return showBackButton(() => setStep((s) => Math.max(1, s - 1)));
  }, [step]);

  const previewOrder: Order = {
    id: 0, want_asset: wantAsset, want_amount: wantAmount || '0', status: 'active',
    location_city: city || null, location_country: null, comment: null,
    created_by_user_id: 0, created_at: new Date().toISOString(), expires_at: null,
    give_options: [{
      id: 0, asset: giveAsset,
      max_rate: opts[0]?.max_rate || null,
      payment_methods: opts[0]?.payment_methods ?? [],
      reference_rate: null, reference_source: null, delta_percent: null,
    }],
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
              <span className="pd-form-title">Currency pair</span>
            </div>
            <CurrencyPairPicker
              giveAsset={giveAsset}
              wantAsset={wantAsset}
              onGiveChange={handleGiveChange}
              onWantChange={handleWantChange}
              onSwap={handleSwap}
            />
            <span className="pd-label">Amount <span className="pd-label-opt">· {wantAsset}</span></span>
            <label className="pd-amount-field">
              <span className="pd-amount-glyph">{PD_GLYPH[wantAsset]}</span>
              <input className="pd-input pd-input-amount pd-num" inputMode="decimal" placeholder="1000"
                value={wantAmount} onChange={(e) => setWantAmount(e.target.value)}
                onFocus={(e) => scrollFieldIntoView(e.currentTarget)} />
              <span className="pd-amount-code">{wantAsset}</span>
            </label>
            <span className="pd-label">City <span className="pd-label-opt">· optional</span></span>
            <label className="pd-field">
              <Icon name="pin" size={16} cls="pd-field-ic" />
              <input className="pd-input" inputMode="text" placeholder="e.g. Bar" value={city}
                onChange={(e) => setCity(e.target.value)}
                onFocus={(e) => scrollFieldIntoView(e.currentTarget)} />
            </label>
          </div>
          {!hasMainButton() && <button className="pd-btn-block" disabled={!amountValid} onClick={primaryAction}>Continue</button>}
        </div>
      )}

      {step === 2 && (
        <div className="pd-form-multi">
          <div className="pd-form-section">
            <div className="pd-form-section-head">
              <span className="pd-form-n pd-num">2</span>
              <span className="pd-form-title">I will give</span>
            </div>
            <div className="pd-give-editors">
              {(() => {
                const o = opts[0] ?? { id: 0, asset: giveAsset, max_rate: '', payment_methods: [] };
                return (
                  <div className="pd-give-editor">
                    <div className="pd-row pd-give-editor-head">
                      <span className="pd-asset">
                        <span className={`pd-glyph pd-glyph-${giveAsset} pd-glyph-sm`} aria-hidden="true">{PD_GLYPH[giveAsset]}</span>
                        <span className="pd-asset-code">{giveAsset}</span>
                      </span>
                    </div>
                    <RateSlider
                      base={wantAsset}
                      quote={giveAsset}
                      wantAmount={wantAmount}
                      onWantAmountChange={setWantAmount}
                      onRateResolved={(r) => updateOpt(0, { max_rate: r ?? '' })}
                    />
                    <span className="pd-label">Payment methods</span>
                    <div className="pd-chips pd-chips-wrap" style={{ marginTop: 4 }}>
                      {PAYMENT_METHODS.map((m) => (
                        <button key={m} type="button"
                          className={`pd-chip pd-chip-sm${o.payment_methods.includes(m) ? ' is-on' : ''}`}
                          onClick={() => toggleMethod(0, m)}>
                          {PD_METHOD_LABEL[m] ?? m}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="pd-btn-ghost-sm" style={{ flex: '0 0 auto' }} onClick={() => setStep(1)}>Back</button>
            {!hasMainButton() && <button className="pd-btn-block" style={{ marginTop: 0, flex: 1 }} disabled={!amountValid} onClick={primaryAction}>Continue</button>}
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
            <textarea className="pd-input" inputMode="text" placeholder="e.g. can meet near the marina this evening"
              value={comment} onChange={(e) => setComment(e.target.value)}
              onFocus={(e) => scrollFieldIntoView(e.currentTarget)} />
            <div className="pd-preview">
              <span className="pd-preview-tag">Preview</span>
              <OrderCard order={previewOrder} variant="outcome" />
            </div>
          </div>
          {err && <p style={{ color: 'var(--pd-far)', fontSize: 13, margin: '0 0 8px' }}>{err}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="pd-btn-ghost-sm" style={{ flex: '0 0 auto' }} onClick={() => setStep(2)}>Back</button>
            {!hasMainButton() && <button className="pd-btn-block" style={{ marginTop: 0, flex: 1 }} disabled={busy} onClick={primaryAction}>
              {busy ? 'Publishing…' : 'Publish request'}
            </button>}
          </div>
        </div>
      )}
    </div>
  );
}
