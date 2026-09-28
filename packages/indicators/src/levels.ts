import type { OHLCV } from '@nepse/shared';
import { rollingMax, rollingMin, type Series } from './util';

export interface PivotPoints {
  pivot: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
}

/** Classic floor pivots computed from a completed candle (typically the previous session). */
export function pivotPoints(c: Pick<OHLCV, 'high' | 'low' | 'close'>): PivotPoints {
  const pivot = (c.high + c.low + c.close) / 3;
  const range = c.high - c.low;
  return {
    pivot,
    r1: 2 * pivot - c.low,
    s1: 2 * pivot - c.high,
    r2: pivot + range,
    s2: pivot - range,
    r3: c.high + 2 * (pivot - c.low),
    s3: c.low - 2 * (c.high - pivot),
  };
}

export interface SwingPoint {
  index: number;
  date: Date;
  price: number;
  type: 'HIGH' | 'LOW';
}

/**
 * Swing highs/lows: a bar whose high (low) is the extreme of `lookback` bars on either side.
 * Note: a swing point is only *confirmed* `lookback` bars later — callers generating
 * historical signals must only use points with index <= current - lookback.
 */
export function swingPoints(candles: OHLCV[], lookback = 5): SwingPoint[] {
  const out: SwingPoint[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const win = candles.slice(i - lookback, i + lookback + 1);
    const c = candles[i];
    if (win.every((w) => w.high <= c.high) && win.filter((w) => w.high === c.high).length === 1)
      out.push({ index: i, date: c.date, price: c.high, type: 'HIGH' });
    if (win.every((w) => w.low >= c.low) && win.filter((w) => w.low === c.low).length === 1)
      out.push({ index: i, date: c.date, price: c.low, type: 'LOW' });
  }
  return out;
}

export interface RollingLevels {
  resistance: Series;
  support: Series;
}

/**
 * Rolling support/resistance = lowest low / highest high of the *previous* N candles
 * (excludes the current candle so breakouts can be detected without look-ahead).
 */
export function rollingSupportResistance(candles: OHLCV[], period = 20): RollingLevels {
  const hi = rollingMax(candles.map((c) => c.high), period);
  const lo = rollingMin(candles.map((c) => c.low), period);
  return {
    resistance: [NaN, ...hi.slice(0, -1)],
    support: [NaN, ...lo.slice(0, -1)],
  };
}

export interface FibonacciLevels {
  high: number;
  low: number;
  trend: 'UP' | 'DOWN';
  levels: Record<string, number>;
}

export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

/** Fibonacci retracement over the last `period` candles. */
export function fibonacciRetracement(candles: OHLCV[], period = 60): FibonacciLevels | null {
  const w = candles.slice(-period);
  if (w.length < 2) return null;
  let hiIdx = 0;
  let loIdx = 0;
  w.forEach((c, i) => {
    if (c.high > w[hiIdx].high) hiIdx = i;
    if (c.low < w[loIdx].low) loIdx = i;
  });
  const high = w[hiIdx].high;
  const low = w[loIdx].low;
  const trend = loIdx < hiIdx ? 'UP' : 'DOWN';
  const range = high - low;
  const levels: Record<string, number> = {};
  for (const r of FIB_RATIOS) {
    levels[(r * 100).toFixed(1)] = trend === 'UP' ? high - range * r : low + range * r;
  }
  return { high, low, trend, levels };
}
