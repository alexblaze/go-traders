import { toDateKey, type OHLCV } from '@nepse/shared';

export class DataIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataIntegrityError';
  }
}

/**
 * The backtester refuses to run on data that could silently corrupt results:
 * unsorted candles (would leak future data), duplicates, or invalid OHLC.
 */
export function assertBacktestableCandles(candles: OHLCV[]): void {
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (i > 0) {
      const prev = candles[i - 1].date.getTime();
      if (c.date.getTime() === prev) throw new DataIntegrityError(`Duplicate candle for ${toDateKey(c.date)}`);
      if (c.date.getTime() < prev) throw new DataIntegrityError(`Candles are not in ascending date order at ${toDateKey(c.date)}`);
    }
    if (![c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite)) throw new DataIntegrityError(`Non-numeric OHLCV on ${toDateKey(c.date)}`);
    if (c.open <= 0 || c.close <= 0 || c.low <= 0) throw new DataIntegrityError(`Non-positive price on ${toDateKey(c.date)}`);
    if (c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close)) throw new DataIntegrityError(`Invalid OHLC relationship on ${toDateKey(c.date)}`);
    if (c.volume < 0) throw new DataIntegrityError(`Negative volume on ${toDateKey(c.date)}`);
  }
}
