import { adx, atr, bollinger, ema, historicalVolatility, macd, roc, rsi, volumeSma } from '@nepse/indicators';
import type { OHLCV } from '@nepse/shared';

/**
 * Documented feature set. Every feature at row t uses ONLY candles[0..t] (no look-ahead).
 * The label uses candles (t, t+horizon] and is therefore unknown for the last `horizon` rows,
 * which are excluded from training/evaluation.
 */
export const FEATURE_DOCS: Record<string, string> = {
  ret1: '1-day log return of close',
  ret5: '5-day log return of close',
  ret20: '20-day log return of close',
  rsi14: 'RSI(14) scaled to [0,1]',
  macdHistNorm: 'MACD histogram (12,26,9) divided by close',
  adx14: 'ADX(14) scaled to [0,1]',
  diSpread: '(+DI − −DI) / 100',
  emaSpread: '(EMA20 − EMA50) / EMA50',
  priceVsEma50: '(close − EMA50) / EMA50',
  bbPercentB: 'Bollinger %B (20, 2σ)',
  atrPct: 'ATR(14) / close',
  hv20: '20-day annualised historical volatility / 100',
  volumeRatio: 'volume / 20-day average volume (log)',
  roc12: 'ROC(12) / 100',
};
export const FEATURE_NAMES = Object.keys(FEATURE_DOCS);

export interface FeatureRow {
  date: Date;
  index: number;
  x: number[];
  /** 1 if forward return over `horizon` > threshold, else 0; null when the future is unknown. */
  y: 0 | 1 | null;
  forwardReturn: number | null;
}

export interface FeatureOptions {
  horizon?: number;
  /** Minimum forward return (fraction) to label as 1. */
  threshold?: number;
}

export function buildFeatures(candles: OHLCV[], opts: FeatureOptions = {}): FeatureRow[] {
  const horizon = opts.horizon ?? 5;
  const threshold = opts.threshold ?? 0;
  const c = candles.map((k) => k.close);
  const r = rsi(c, 14);
  const m = macd(c);
  const a = adx(candles, 14);
  const e20 = ema(c, 20);
  const e50 = ema(c, 50);
  const bb = bollinger(c, 20, 2);
  const at = atr(candles, 14);
  const hv = historicalVolatility(c, 20);
  const vs = volumeSma(candles, 20);
  const rc = roc(c, 12);
  const lr = (i: number, k: number) => (i >= k && c[i - k] > 0 ? Math.log(c[i] / c[i - k]) : NaN);
  const rows: FeatureRow[] = [];
  for (let i = 0; i < candles.length; i++) {
    const x = [
      lr(i, 1), lr(i, 5), lr(i, 20), r[i] / 100, m.histogram[i] / c[i], a.adx[i] / 100, (a.plusDI[i] - a.minusDI[i]) / 100,
      (e20[i] - e50[i]) / e50[i], (c[i] - e50[i]) / e50[i], bb.percentB[i], at[i] / c[i], hv[i] / 100,
      vs[i] > 0 ? Math.log((candles[i].volume + 1) / (vs[i] + 1)) : NaN, rc[i] / 100,
    ];
    if (!x.every(Number.isFinite)) continue;
    const fwd = i + horizon < candles.length ? c[i + horizon] / c[i] - 1 : null;
    rows.push({ date: candles[i].date, index: i, x, forwardReturn: fwd, y: fwd === null ? null : fwd > threshold ? 1 : 0 });
  }
  return rows;
}
