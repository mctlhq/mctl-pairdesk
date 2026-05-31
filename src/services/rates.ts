import type { Asset } from '../config.js';

export interface ReferenceRate {
  baseAsset: Asset; // the asset the maker wants (e.g. EUR)
  quoteAsset: Asset; // the asset the maker gives (e.g. RUB)
  rate: number; // quote units per 1 base unit (e.g. RUB per EUR)
  source: string;
  timestamp: string; // ISO
}

// The Central Bank of Russia daily feed gives RUB per unit of each currency, so
// every EUR/RUB/USDT pair we support can be derived from it via a RUB cross
// (USDT is priced as USD). Cached briefly to avoid hammering the source.
const CBR_URL = 'https://www.cbr-xml-daily.ru/daily_json.js';
const CACHE_TTL_MS = 5 * 60_000;

interface RubRates {
  EUR: number; // RUB per EUR
  USD: number; // RUB per USD (used for USDT)
  fetchedAt: number;
  ts: string;
}

let cache: RubRates | null = null;

async function fetchRubRates(): Promise<RubRates | null> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache;
  try {
    const res = await fetch(CBR_URL, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return cache; // serve stale on transient failure
    const data = (await res.json()) as {
      Date?: string;
      Valute?: Record<string, { Value: number; Nominal: number }>;
    };
    const eur = data.Valute?.EUR;
    const usd = data.Valute?.USD;
    if (!eur || !usd) return cache;
    cache = {
      EUR: eur.Value / eur.Nominal,
      USD: usd.Value / usd.Nominal,
      fetchedAt: Date.now(),
      ts: data.Date ?? new Date().toISOString(),
    };
    return cache;
  } catch {
    return cache;
  }
}

// RUB per 1 unit of the asset (RUB itself = 1; USDT priced as USD).
function rubPer(asset: Asset, r: RubRates): number {
  switch (asset) {
    case 'RUB':
      return 1;
    case 'EUR':
      return r.EUR;
    case 'USDT':
      return r.USD;
  }
}

/**
 * Market reference quote: how many `quote` units for 1 `base` unit. Returns null
 * when the source is unavailable (callers then store no snapshot — the order is
 * still created; the rate warning is simply absent). Best-effort, never throws.
 */
export async function getReferenceRate(base: Asset, quote: Asset): Promise<ReferenceRate | null> {
  if (base === quote) return null;
  const r = await fetchRubRates();
  if (!r) return null;
  const rate = rubPer(base, r) / rubPer(quote, r);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return { baseAsset: base, quoteAsset: quote, rate, source: 'CBR', timestamp: r.ts };
}

/** Signed % deviation of a user's rate from the reference (positive = above market). */
export function deltaPercent(userRate: number, referenceRate: number): number {
  if (!referenceRate) return 0;
  return ((userRate - referenceRate) / referenceRate) * 100;
}
