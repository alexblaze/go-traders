import { MarketCalendar, toDateKey, type OHLCV } from '@nepse/shared';

export type QualityFlagCode = 'MISSING_DATE' | 'DUPLICATE_CANDLE' | 'INVALID_OHLC' | 'NEGATIVE_VOLUME' | 'NEGATIVE_PRICE' | 'EXTREME_MOVE' | 'ZERO_VOLUME' | 'UNSORTED';

export interface QualityFlag {
  code: QualityFlagCode;
  date: string;
  message: string;
}

export interface QualityReport {
  candles: number;
  flags: QualityFlag[];
  missingDates: string[];
  ok: boolean;
}

/**
 * Detects data-quality problems. It FLAGS suspicious data; it never modifies it.
 */
export function checkDataQuality(candles: OHLCV[], opts: { calendar?: MarketCalendar; extremeMove?: number } = {}): QualityReport {
  const flags: QualityFlag[] = [];
  const extreme = opts.extremeMove ?? 0.15;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const d = toDateKey(c.date);
    if (i > 0) {
      const p = candles[i - 1];
      if (c.date.getTime() === p.date.getTime()) flags.push({ code: 'DUPLICATE_CANDLE', date: d, message: 'Duplicate candle for date' });
      else if (c.date.getTime() < p.date.getTime()) flags.push({ code: 'UNSORTED', date: d, message: 'Candle out of chronological order' });
      else if (p.close > 0 && Math.abs(c.close / p.close - 1) > extreme)
        flags.push({ code: 'EXTREME_MOVE', date: d, message: `${((c.close / p.close - 1) * 100).toFixed(1)}% move — possible corporate action or bad tick` });
    }
    if ([c.open, c.high, c.low, c.close].some((v) => v <= 0)) flags.push({ code: 'NEGATIVE_PRICE', date: d, message: 'Non-positive price' });
    if (c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close)) flags.push({ code: 'INVALID_OHLC', date: d, message: 'high < max(open, close) or low > min(open, close)' });
    if (c.volume < 0) flags.push({ code: 'NEGATIVE_VOLUME', date: d, message: 'Negative volume' });
    else if (c.volume === 0) flags.push({ code: 'ZERO_VOLUME', date: d, message: 'Zero volume (no trades?)' });
  }
  const missingDates = opts.calendar && candles.length > 1 ? opts.calendar.missingDates(candles.map((c) => c.date), candles[0].date, candles[candles.length - 1].date) : [];
  for (const m of missingDates.slice(0, 200)) flags.push({ code: 'MISSING_DATE', date: m, message: 'Expected trading day has no candle (holiday not configured?)' });
  return { candles: candles.length, flags, missingDates, ok: flags.every((f) => f.code === 'ZERO_VOLUME' || f.code === 'MISSING_DATE') };
}
