import type { OHLCV } from '@nepse/shared';

/** Build candles from closes with a deterministic high/low envelope. */
export function candlesFromCloses(closes: number[], volume = 1000): OHLCV[] {
  return closes.map((c, i) => ({
    date: new Date(Date.UTC(2025, 0, 1 + i)),
    open: i === 0 ? c : closes[i - 1],
    high: Math.max(c, i === 0 ? c : closes[i - 1]) + 1,
    low: Math.min(c, i === 0 ? c : closes[i - 1]) - 1,
    close: c,
    volume,
    turnover: c * volume,
  }));
}

export const linear = (n: number, start = 100, step = 1) => Array.from({ length: n }, (_, i) => start + i * step);
