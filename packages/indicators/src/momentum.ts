import type { OHLCV } from '@nepse/shared';
import { sma, typicalPrice, wilder } from './trend';
import { assertPeriod, nanSeries, rolling, rollingMax, rollingMin, type Series } from './util';

/** Wilder RSI. First value at index `period`. */
export function rsi(values: Series, period = 14): Series {
  assertPeriod(period);
  const n = values.length;
  const out = nanSeries(n);
  if (n <= period) return out;
  const gains = nanSeries(n);
  const losses = nanSeries(n);
  for (let i = 1; i < n; i++) {
    const d = values[i] - values[i - 1];
    gains[i] = Math.max(d, 0);
    losses[i] = Math.max(-d, 0);
  }
  const ag = wilder(gains, period);
  const al = wilder(losses, period);
  for (let i = period; i < n; i++) {
    if (!Number.isFinite(ag[i]) || !Number.isFinite(al[i])) continue;
    if (al[i] === 0) out[i] = ag[i] === 0 ? 50 : 100;
    else out[i] = 100 - 100 / (1 + ag[i] / al[i]);
  }
  return out;
}

export interface StochasticResult {
  k: Series;
  d: Series;
}

export function stochastic(candles: OHLCV[], kPeriod = 14, dPeriod = 3, smoothK = 1): StochasticResult {
  const hh = rollingMax(candles.map((c) => c.high), kPeriod);
  const ll = rollingMin(candles.map((c) => c.low), kPeriod);
  const raw = candles.map((c, i) => {
    if (!Number.isFinite(hh[i])) return NaN;
    const range = hh[i] - ll[i];
    return range === 0 ? 50 : (100 * (c.close - ll[i])) / range;
  });
  const k = smoothK > 1 ? smaSkip(raw, smoothK) : raw;
  return { k, d: smaSkip(k, dPeriod) };
}

/** SMA that tolerates leading NaNs. */
function smaSkip(values: Series, period: number): Series {
  const start = values.findIndex(Number.isFinite);
  if (start < 0) return nanSeries(values.length);
  const tail = sma(values.slice(start), period);
  return [...nanSeries(start), ...tail];
}

export function stochRsi(values: Series, rsiPeriod = 14, stochPeriod = 14, kSmooth = 3, dSmooth = 3): StochasticResult {
  const r = rsi(values, rsiPeriod);
  const start = r.findIndex(Number.isFinite);
  const raw = nanSeries(values.length);
  if (start >= 0) {
    const tail = r.slice(start);
    const hi = rollingMax(tail, stochPeriod);
    const lo = rollingMin(tail, stochPeriod);
    tail.forEach((v, j) => {
      if (!Number.isFinite(hi[j])) return;
      const range = hi[j] - lo[j];
      raw[start + j] = range === 0 ? 50 : (100 * (v - lo[j])) / range;
    });
  }
  const k = smaSkip(raw, kSmooth);
  return { k, d: smaSkip(k, dSmooth) };
}

export function williamsR(candles: OHLCV[], period = 14): Series {
  const hh = rollingMax(candles.map((c) => c.high), period);
  const ll = rollingMin(candles.map((c) => c.low), period);
  return candles.map((c, i) => {
    if (!Number.isFinite(hh[i])) return NaN;
    const range = hh[i] - ll[i];
    return range === 0 ? -50 : (-100 * (hh[i] - c.close)) / range;
  });
}

/** Rate of change in percent. */
export function roc(values: Series, period = 12): Series {
  assertPeriod(period);
  return values.map((v, i) => (i >= period && values[i - period] !== 0 ? ((v - values[i - period]) / values[i - period]) * 100 : NaN));
}

export function cci(candles: OHLCV[], period = 20): Series {
  const tp = candles.map(typicalPrice);
  return rolling(tp, period, (w) => {
    const m = w.reduce((a, b) => a + b, 0) / period;
    const md = w.reduce((a, b) => a + Math.abs(b - m), 0) / period;
    return md === 0 ? 0 : (w[w.length - 1] - m) / (0.015 * md);
  });
}
