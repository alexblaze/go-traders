/** A series aligned with its input. Warm-up positions are NaN. */
export type Series = number[];

export function nanSeries(length: number): Series {
  return new Array<number>(length).fill(NaN);
}

export function assertPeriod(period: number, name = 'period'): void {
  if (!Number.isInteger(period) || period < 1) throw new RangeError(`${name} must be a positive integer, got ${period}`);
}

/** Index of first finite value, or -1. */
export function firstFinite(values: Series): number {
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) return i;
  return -1;
}

/** Rolling window reducer. `fn` receives the window slice ending at i. */
export function rolling(values: Series, period: number, fn: (window: number[]) => number): Series {
  assertPeriod(period);
  const out = nanSeries(values.length);
  for (let i = period - 1; i < values.length; i++) {
    const w = values.slice(i - period + 1, i + 1);
    if (w.every(Number.isFinite)) out[i] = fn(w);
  }
  return out;
}

export function rollingMax(values: Series, period: number): Series {
  return rolling(values, period, (w) => Math.max(...w));
}

export function rollingMin(values: Series, period: number): Series {
  return rolling(values, period, (w) => Math.min(...w));
}

export function rollingSum(values: Series, period: number): Series {
  return rolling(values, period, (w) => w.reduce((a, b) => a + b, 0));
}
