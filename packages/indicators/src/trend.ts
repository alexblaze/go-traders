import type { OHLCV } from '@nepse/shared';
import { assertPeriod, firstFinite, nanSeries, rolling, type Series } from './util';

export function sma(values: Series, period: number): Series {
  return rolling(values, period, (w) => w.reduce((a, b) => a + b, 0) / period);
}

/**
 * Exponential moving average seeded with the SMA of the first `period` finite values.
 * Leading NaNs (e.g. from an upstream indicator) are skipped.
 */
export function ema(values: Series, period: number): Series {
  assertPeriod(period);
  const out = nanSeries(values.length);
  const start = firstFinite(values);
  if (start < 0 || values.length - start < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = start; i < start + period; i++) prev += values[i];
  prev /= period;
  out[start + period - 1] = prev;
  for (let i = start + period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's smoothing (RMA), used by RSI / ATR / ADX. */
export function wilder(values: Series, period: number): Series {
  assertPeriod(period);
  const out = nanSeries(values.length);
  const start = firstFinite(values);
  if (start < 0 || values.length - start < period) return out;
  let prev = 0;
  for (let i = start; i < start + period; i++) prev += values[i];
  prev /= period;
  out[start + period - 1] = prev;
  for (let i = start + period; i < values.length; i++) {
    prev = (prev * (period - 1) + values[i]) / period;
    out[i] = prev;
  }
  return out;
}

export function wma(values: Series, period: number): Series {
  const denom = (period * (period + 1)) / 2;
  return rolling(values, period, (w) => w.reduce((a, v, i) => a + v * (i + 1), 0) / denom);
}

export function typicalPrice(c: OHLCV): number {
  return (c.high + c.low + c.close) / 3;
}

/**
 * VWAP. With `period` it is a rolling N-candle VWAP (appropriate for daily data);
 * without, it is cumulative from the first candle (anchored VWAP).
 */
export function vwap(candles: OHLCV[], period?: number): Series {
  const out = nanSeries(candles.length);
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < candles.length; i++) {
    pv += typicalPrice(candles[i]) * candles[i].volume;
    vol += candles[i].volume;
    if (period && i >= period) {
      const old = candles[i - period];
      pv -= typicalPrice(old) * old.volume;
      vol -= old.volume;
    }
    if ((!period || i >= period - 1) && vol > 0) out[i] = pv / vol;
  }
  return out;
}

export interface MacdResult {
  macd: Series;
  signal: Series;
  histogram: Series;
}

export function macd(values: Series, fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  if (fast >= slow) throw new RangeError('MACD fast period must be smaller than slow period');
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line = values.map((_, i) => (Number.isFinite(f[i]) && Number.isFinite(s[i]) ? f[i] - s[i] : NaN));
  const signal = ema(line, signalPeriod);
  const histogram = line.map((m, i) => (Number.isFinite(m) && Number.isFinite(signal[i]) ? m - signal[i] : NaN));
  return { macd: line, signal, histogram };
}

export function trueRange(candles: OHLCV[]): Series {
  return candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const pc = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  });
}

export interface AdxResult {
  adx: Series;
  plusDI: Series;
  minusDI: Series;
}

/** Wilder's ADX / DMI. First ADX value appears at index 2*period-1. */
export function adx(candles: OHLCV[], period = 14): AdxResult {
  assertPeriod(period);
  const n = candles.length;
  const plusDI = nanSeries(n);
  const minusDI = nanSeries(n);
  const out = nanSeries(n);
  if (n <= period) return { adx: out, plusDI, minusDI };

  const tr = trueRange(candles);
  const pdm = nanSeries(n);
  const mdm = nanSeries(n);
  for (let i = 1; i < n; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    pdm[i] = up > down && up > 0 ? up : 0;
    mdm[i] = down > up && down > 0 ? down : 0;
  }

  let sTR = 0;
  let sP = 0;
  let sM = 0;
  for (let i = 1; i <= period; i++) {
    sTR += tr[i];
    sP += pdm[i];
    sM += mdm[i];
  }
  const dx = nanSeries(n);
  for (let i = period; i < n; i++) {
    if (i > period) {
      sTR = sTR - sTR / period + tr[i];
      sP = sP - sP / period + pdm[i];
      sM = sM - sM / period + mdm[i];
    }
    const p = sTR === 0 ? 0 : (100 * sP) / sTR;
    const m = sTR === 0 ? 0 : (100 * sM) / sTR;
    plusDI[i] = p;
    minusDI[i] = m;
    dx[i] = p + m === 0 ? 0 : (100 * Math.abs(p - m)) / (p + m);
  }
  const first = 2 * period - 1;
  if (n <= first) return { adx: out, plusDI, minusDI };
  let a = 0;
  for (let i = period; i <= first; i++) a += dx[i];
  a /= period;
  out[first] = a;
  for (let i = first + 1; i < n; i++) {
    a = (a * (period - 1) + dx[i]) / period;
    out[i] = a;
  }
  return { adx: out, plusDI, minusDI };
}

/** Parabolic SAR (Wilder). */
export function parabolicSar(candles: OHLCV[], step = 0.02, maxStep = 0.2): Series {
  const n = candles.length;
  const out = nanSeries(n);
  if (n < 2) return out;
  let up = candles[1].close >= candles[0].close;
  let af = step;
  let ep = up ? candles[0].high : candles[0].low;
  let sar = up ? candles[0].low : candles[0].high;
  for (let i = 1; i < n; i++) {
    const c = candles[i];
    sar = sar + af * (ep - sar);
    if (up) {
      sar = Math.min(sar, candles[i - 1].low, i > 1 ? candles[i - 2].low : candles[i - 1].low);
      if (c.low < sar) {
        up = false;
        sar = ep;
        ep = c.low;
        af = step;
      } else if (c.high > ep) {
        ep = c.high;
        af = Math.min(af + step, maxStep);
      }
    } else {
      sar = Math.max(sar, candles[i - 1].high, i > 1 ? candles[i - 2].high : candles[i - 1].high);
      if (c.high > sar) {
        up = true;
        sar = ep;
        ep = c.high;
        af = step;
      } else if (c.low < ep) {
        ep = c.low;
        af = Math.min(af + step, maxStep);
      }
    }
    out[i] = sar;
  }
  return out;
}
