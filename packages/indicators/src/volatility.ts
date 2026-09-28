import type { OHLCV } from '@nepse/shared';
import { sma, trueRange, wilder } from './trend';
import { rolling, type Series } from './util';

/** Rolling population standard deviation (as used by Bollinger Bands). */
export function rollingStdev(values: Series, period: number): Series {
  return rolling(values, period, (w) => {
    const m = w.reduce((a, b) => a + b, 0) / w.length;
    return Math.sqrt(w.reduce((a, v) => a + (v - m) ** 2, 0) / w.length);
  });
}

export interface BollingerResult {
  upper: Series;
  middle: Series;
  lower: Series;
  /** (upper - lower) / middle */
  bandwidth: Series;
  /** (price - lower) / (upper - lower) */
  percentB: Series;
}

export function bollinger(values: Series, period = 20, mult = 2): BollingerResult {
  const middle = sma(values, period);
  const sd = rollingStdev(values, period);
  const upper = middle.map((m, i) => m + mult * sd[i]);
  const lower = middle.map((m, i) => m - mult * sd[i]);
  const bandwidth = middle.map((m, i) => (m ? (upper[i] - lower[i]) / m : NaN));
  const percentB = values.map((v, i) => {
    const r = upper[i] - lower[i];
    return Number.isFinite(r) ? (r === 0 ? 0.5 : (v - lower[i]) / r) : NaN;
  });
  return { upper, middle, lower, bandwidth, percentB };
}

export function atr(candles: OHLCV[], period = 14): Series {
  return wilder(trueRange(candles), period);
}

/**
 * Annualised historical volatility (in %) from log returns.
 * `periodsPerYear` is configurable; NEPSE has roughly 230–245 sessions per year.
 */
export function historicalVolatility(values: Series, period = 20, periodsPerYear = 240): Series {
  const logRet = values.map((v, i) => (i === 0 || values[i - 1] <= 0 || v <= 0 ? NaN : Math.log(v / values[i - 1])));
  return rolling(logRet, period, (w) => {
    const m = w.reduce((a, b) => a + b, 0) / w.length;
    const sd = Math.sqrt(w.reduce((a, v) => a + (v - m) ** 2, 0) / (w.length - 1 || 1));
    return sd * Math.sqrt(periodsPerYear) * 100;
  });
}
