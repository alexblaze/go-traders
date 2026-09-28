import type { OHLCV } from '@nepse/shared';

export function candles(closes: number[], volumes?: number[]): OHLCV[] {
  return closes.map((c, i) => {
    const o = i === 0 ? c : closes[i - 1];
    return {
      date: new Date(Date.UTC(2024, 0, 1 + i)),
      open: o,
      high: Math.max(o, c) * 1.005,
      low: Math.min(o, c) * 0.995,
      close: c,
      volume: volumes?.[i] ?? 10000,
      turnover: c * (volumes?.[i] ?? 10000),
    };
  });
}

/** Down-trend then up-trend (V shape) — produces a fast/slow EMA bullish crossover. */
export function vShape(n = 160): number[] {
  const half = n / 2;
  return Array.from({ length: n }, (_, i) => (i < half ? 200 - i : 200 - half + (i - half) * 1.5));
}

export function upTrend(n = 120, start = 100, step = 1): number[] {
  return Array.from({ length: n }, (_, i) => start + i * step + Math.sin(i / 2));
}

export function downTrend(n = 120, start = 300, step = 1): number[] {
  return Array.from({ length: n }, (_, i) => start - i * step + Math.sin(i / 2));
}
