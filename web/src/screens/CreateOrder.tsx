import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api.js';
import { CurrencyPairPicker, Icon, OrderCard, PD_METHOD_LABEL, RateSlider, Stepper } from '../components.js';
import { hasMainButton, hapticError, hapticSelection, hapticSuccess, scrollFieldIntoView, setMainButton, showBackButton } from '../tg.js';
import { ASSETS, type Asset, PAYMENT_METHODS } from '../types.js';
import type { Order } from '../types.js';

interface OptDraft {
  id: number;       // stable across reorders/removals so RatePreview keeps its state
  asset: Asset;
  max_rate: string;
  payment_methods: string[];
}

export function CreateOrder({ onCreated, onExit }: { onCreated: (id: number) => void; onExit: () => void }) {
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

  // Keep the single give option locked to the step-1 give asset.
  // Reset rate and payment methods when the asset changes.
  useEffect(() => {
    setOpts((prev) => {
      if (prev[0].asset === giveAsset) return prev;
      return [{ ...prev[0], asset: giveAsset, max_rate: '', payment_methods: [] }];
    });
  }, [giveAsset]);

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
      const order = await api.post<{ id: number }>('/orders', {
        want_asset: wantAsset, want_amount: wantAmount,
        location_city: city.trim() || null, comment: comment.trim() || null,
        give_options: opts.map((o) => ({
          asset: o.asset,
          max_rate: o.max_rate.trim() || null,
          payment_methods: o.payment_methods,
        })),
      });
      hapticSuccess();
      onCreated(order.id);
    } catch (e) {
      hapticError();
      setErr(e instanceof ApiError ? e.message : (e as Error).message);
    } finally { setBusy(false); }
  }

  // Step 1: always enabled (pair defaults are pre-set).
  // Step 2: enabled when at least one give option has a valid want-amount.
  // Step 3: enabled when not busy.
  const nextEnabled = step === 1 ? true : step === 2 ? amountValid : !busy;
  const nextText = step === 1 ? 'Continue' : step === 2 ? 'Continue' : (busy ? 'Publishing…' : 'Publish request');

  function primaryAction() {
    if (step === 1) {
      hapticSelection();
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!amountValid) { hapticError(); return; }
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

  // Hold onExit in a ref so the back-button effect can depend only on [step]
  // (onExit is a fresh closure each parent render; without the ref it would
  // re-register the Telegram BackButton on every keystroke).
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  useEffect(() => {
    return setMainButton({
      text: nextText,
      enabled: nextEnabled,
      loading: busy,
      onClick: () => primaryActionRef.current(),
    });
  }, [busy, nextEnabled, nextText, step]);

  useEffect(() => {
    // At step 1 the Telegram back button leaves the create flow entirely — the
    // app tab bar is hidden while creating, so this is the user's only way back
    // to Book/Profile. Deeper steps step back one.
    if (step === 1) return showBackButton(() => onExitRef.current());
    return showBackButton(() => setStep((s) => Math.max(1, s - 1)));
  }, [step]);

  const previewOrder: Order = {
    id: 0, want_asset: wantAsset, want_amount: wantAmount || '0', status: 'active',
    location_city: city || null, location_country: null, comment: null,
    created_by_user_id: 0, created_at: new Date().toISOString(), expires_at: null,
    give_options: opts.map((o) => ({
      id: o.id,
      asset: o.asset,
      max_rate: o.max_rate || null,
      payment_methods: o.payment_methods,
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
              <span className="pd-form-title">Currency pair</span>
            </div>
            <CurrencyPairPicker
              giveAsset={giveAsset}
              wantAsset={wantAsset}
              onGiveChange={handleGiveChange}
              onWantChange={handleWantChange}
              onSwap={handleSwap}
            />
          </div>
          {!hasMainButton() && (
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="pd-btn-ghost-sm" style={{ flex: '0 0 auto' }} onClick={onExit}>Cancel</button>
              <button className="pd-btn-block" style={{ marginTop: 0, flex: 1 }} onClick={primaryAction}>Continue</button>
            </div>
          )}
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
              <div className="pd-give-editor">
                <RateSlider
                  base={wantAsset}
                  quote={opts[0].asset}
                  wantAmount={wantAmount}
                  onWantAmountChange={setWantAmount}
                  onRateResolved={(r) => updateOpt(0, { max_rate: r ?? '' })}
                />
                <span className="pd-label">Payment methods</span>
                <div className="pd-chips pd-chips-wrap" style={{ marginTop: 4 }}>
                  {PAYMENT_METHODS.map((m) => (
                    <button key={m} type="button"
                      className={`pd-chip pd-chip-sm${opts[0].payment_methods.includes(m) ? ' is-on' : ''}`}
                      onClick={() => toggleMethod(0, m)}>
                      {PD_METHOD_LABEL[m] ?? m}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {!hasMainButton() && (
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="pd-btn-ghost-sm" style={{ flex: '0 0 auto' }} onClick={() => setStep(1)}>Back</button>
              <button className="pd-btn-block" style={{ marginTop: 0, flex: 1 }} disabled={!amountValid} onClick={primaryAction}>Continue</button>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="pd-form-multi">
          <div className="pd-form-section">
            <div className="pd-form-section-head">
              <span className="pd-form-n pd-num">3</span>
              <span className="pd-form-title">Note &amp; preview</span>
            </div>
            <span className="pd-label">City <span className="pd-label-opt">· optional</span></span>
            <label className="pd-field">
              <Icon name="pin" size={16} cls="pd-field-ic" />
              <input className="pd-input" inputMode="text" placeholder="e.g. Bar" value={city}
                onChange={(e) => setCity(e.target.value)}
                onFocus={(e) => scrollFieldIntoView(e.currentTarget)} />
            </label>
            <span className="pd-label">Notes <span className="pd-label-opt">· optional</span></span>
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
          {!hasMainButton() && (
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="pd-btn-ghost-sm" style={{ flex: '0 0 auto' }} onClick={() => setStep(2)}>Back</button>
              <button className="pd-btn-block" style={{ marginTop: 0, flex: 1 }} disabled={busy} onClick={primaryAction}>
                {busy ? 'Publishing…' : 'Publish request'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
