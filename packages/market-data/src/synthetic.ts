import { addDays, MarketCalendar, type OHLCV } from '@nepse/shared';
import type { DemoStockSpec } from './demo-universe';
import { gaussian, hashString, mulberry32 } from './random';

export interface SyntheticOptions {
  from: Date;
  to: Date;
  calendar?: MarketCalendar;
  /** Shared market factor so the demo universe has realistic co-movement. */
  marketSeed?: number;
}

/**
 * Generate SYNTHETIC daily candles: GBM with a shared market factor, regime shifts,
 * volatility clustering and volume spikes. Output is deterministic per symbol.
 * NEPSE's ±10% circuit breaker is respected.
 */
export function generateSyntheticCandles(spec: DemoStockSpec, opts: SyntheticOptions): OHLCV[] {
  const cal = opts.calendar ?? new MarketCalendar();
  const days = cal.tradingDays(opts.from, opts.to);
  const rand = mulberry32(hashString(spec.symbol));
  const mkt = mulberry32(opts.marketSeed ?? 42);
  const out: OHLCV[] = [];
  let price = spec.basePrice;
  let vol = spec.volatility;
  let regimeDrift = 0;
  for (let i = 0; i < days.length; i++) {
    if (i % 60 === 0) regimeDrift = (rand() - 0.5) * 0.004;
    const m = gaussian(mkt) * 0.009;
    const shock = gaussian(rand);
    vol = Math.max(spec.volatility * 0.5, Math.min(spec.volatility * 2.5, vol * 0.94 + spec.volatility * 0.06 + Math.abs(shock) * 0.001));
    let ret = spec.drift + regimeDrift + 0.6 * m + shock * vol;
    ret = Math.max(-0.1, Math.min(0.1, ret));
    const open = price * (1 + gaussian(rand) * vol * 0.25);
    const close = Math.max(1, price * (1 + ret));
    const hi = Math.max(open, close) * (1 + Math.abs(gaussian(rand)) * vol * 0.4);
    const lo = Math.min(open, close) * (1 - Math.abs(gaussian(rand)) * vol * 0.4);
    const spike = rand() < 0.05 ? 2 + rand() * 3 : 1;
    const volume = Math.round(spec.avgVolume * spike * (0.6 + rand() * 0.8) * (1 + Math.abs(ret) * 10));
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const o = r2(open), c = r2(close);
    out.push({ date: days[i], open: o, high: Math.max(r2(hi), o, c), low: Math.min(r2(lo), o, c), close: c, volume, turnover: Math.round(volume * ((o + c) / 2)) });
    price = close;
  }
  return out;
}

export function defaultDemoRange(now = new Date()): { from: Date; to: Date } {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { from: addDays(to, -365 * 3), to };
}
