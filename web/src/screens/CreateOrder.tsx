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
  const [nextOptId, setNextOptId] = useState(1);
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

  // Keep the first give option locked to the step-1 give asset, and drop any
  // alternative that now collides with the want asset, the give asset, or an
  // earlier option. Without this, changing the pair on step 1 leaves opts[0]
  // on its initial asset (step 2 would show the wrong currency and submit the
  // wrong give_options[0].asset), and editing wantAsset after adding
  // alternatives could leave an option that gives the very asset being wanted.
  useEffect(() => {
    setOpts((prev) => {
      const synced = (() => {
        if (!prev.length) return [{ id: 0, asset: giveAsset, max_rate: '', payment_methods: [] }];
        if (prev[0].asset === giveAsset) return prev;
        // The step-1 give asset changed. If an alternative is already configured
        // on that asset, PROMOTE it to primary (swap slots) so the user's rate /
        // payment methods for it survive — don't overwrite and dedup-discard.
        const matchIdx = prev.findIndex((o, idx) => idx > 0 && o.asset === giveAsset);
        if (matchIdx > 0) {
          const next = [...prev];
          [next[0], next[matchIdx]] = [next[matchIdx], next[0]];
          return next;
        }
        // No matching alternative: retarget the primary and clear its rate +
        // payment methods — a rate/method chosen for the old asset is meaningless
        // for the new one (the rate-available path self-heals via RateSlider's
        // refetch, but the free-text 503 path would otherwise keep a stale rate).
        return [{ ...prev[0], asset: giveAsset, max_rate: '', payment_methods: [] }, ...prev.slice(1)];
      })();
      const seen = new Set<Asset>();
      const deduped = synced.filter((o) => {
        if (o.asset === wantAsset || seen.has(o.asset)) return false;
        seen.add(o.asset);
        return true;
      });
      return deduped.length ? deduped : [{ id: 0, asset: giveAsset, max_rate: '', payment_methods: [] }];
    });
  }, [giveAsset, wantAsset]);

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

  function removeOpt(i: number) {
    // Index 0 is the primary give option, locked to the step-1 give asset — only
    // alternatives (i > 0) are removable. The remove button is hidden for i === 0,
    // but guard here too so the primary can never be dropped.
    if (i === 0) return;
    hapticSelection();
    setOpts((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addAlternative() {
    // TODO: extend when ASSETS grows beyond three entries
    const usedAssets = new Set<Asset>([wantAsset, ...opts.map((o) => o.asset)]);
    const freeAsset = ASSETS.find((a) => !usedAssets.has(a));
    if (!freeAsset) return;
    hapticSelection();
    const newId = nextOptId;
    setNextOptId((n) => n + 1);
    setOpts((prev) => [...prev, { id: newId, asset: freeAsset, max_rate: '', payment_methods: [] }]);
  }

  const amountValid = /^\d+(\.\d+)?$/.test(wantAmount) && Number.parseFloat(wantAmount) > 0;

  // canAddAlternative: there is still a free asset not used as wantAsset or by any existing opt
  const canAddAlternative = opts.length < ASSETS.length - 1;

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
          {!hasMainButton() && <button className="pd-btn-block" onClick={primaryAction}>Continue</button>}
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
              {opts.map((o, i) => (
                <div key={o.id} className="pd-give-editor">
                  <div className="pd-row pd-give-editor-head">
                    <span className="pd-asset">
                      <span className={`pd-glyph pd-glyph-${o.asset} pd-glyph-sm`} aria-hidden="true">{PD_GLYPH[o.asset]}</span>
                      <span className="pd-asset-code">{o.asset}</span>
                    </span>
                    {i > 0 && (
                      <button
                        type="button"
                        className="pd-btn-ghost-sm"
                        style={{ marginLeft: 'auto' }}
                        onClick={() => removeOpt(i)}
                        aria-label={`Remove ${o.asset} option`}
                      >
                        <Icon name="close" size={14} />
                      </button>
                    )}
                  </div>
                  <RateSlider
                    base={wantAsset}
                    quote={o.asset}
                    wantAmount={wantAmount}
                    onWantAmountChange={setWantAmount}
                    onRateResolved={(r) => updateOpt(i, { max_rate: r ?? '' })}
                  />
                  <span className="pd-label">Payment methods</span>
                  <div className="pd-chips pd-chips-wrap" style={{ marginTop: 4 }}>
                    {PAYMENT_METHODS.map((m) => (
                      <button key={m} type="button"
                        className={`pd-chip pd-chip-sm${o.payment_methods.includes(m) ? ' is-on' : ''}`}
                        onClick={() => toggleMethod(i, m)}>
                        {PD_METHOD_LABEL[m] ?? m}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {canAddAlternative && (
              <button
                type="button"
                className="pd-btn-ghost-sm"
                style={{ marginTop: 8 }}
                onClick={addAlternative}
              >
                <Icon name="plus" size={14} />
                {' '}Add alternative
              </button>
            )}
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
              <span className="pd-form-title">Note &amp; preview</span>
            </div>
            <span className="pd-label">City <span className="pd-label-opt">· optional</span></span>
            <label className="pd-field">
              <Icon name="pin" size={16} cls="pd-field-ic" />
              <input className="pd-input" inputMode="text" placeholder="e.g. Bar" value={city}
                onChange={(e) => setCity(e.target.value)}
                onFocus={(e) => scrollFieldIntoView(e.currentTarget)} />
            </label>
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
