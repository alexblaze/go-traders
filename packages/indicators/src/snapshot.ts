import { last, type OHLCV } from '@nepse/shared';
import { roc, rsi, stochastic } from './momentum';
import { adx, ema, macd, sma } from './trend';
import { atr, bollinger, historicalVolatility } from './volatility';
import { cmf, mfi, obv, volumeSma } from './volume';
import { rollingSupportResistance } from './levels';

/**
 * Latest values of the commonly used indicators — the "indicator snapshot" persisted with
 * signals, used by the screener, watchlists, alerts and the AI analyst.
 * Values are NaN (serialised as null) when there is insufficient history.
 */
export interface IndicatorSnapshot {
  close: number;
  prevClose: number;
  changePercent: number;
  volume: number;
  turnover: number;
  sma20: number;
  sma50: number;
  sma200: number;
  ema20: number;
  ema50: number;
  ema200: number;
  rsi14: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  adx14: number;
  plusDI: number;
  minusDI: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  bbBandwidth: number;
  atr14: number;
  atrPercent: number;
  hv20: number;
  roc12: number;
  stochK: number;
  stochD: number;
  mfi14: number;
  cmf20: number;
  obv: number;
  volumeSma20: number;
  volumeRatio: number;
  high52w: number;
  low52w: number;
  resistance20: number;
  support20: number;
}

export function computeSnapshot(candles: OHLCV[]): IndicatorSnapshot {
  const c = candles.map((x) => x.close);
  const n = candles.length;
  const lastC = candles[n - 1];
  const prev = n > 1 ? candles[n - 2].close : NaN;
  const m = macd(c);
  const a = adx(candles);
  const bb = bollinger(c);
  const st = stochastic(candles, 14, 3, 3);
  const atr14 = last(atr(candles));
  const vs = last(volumeSma(candles));
  const sr = rollingSupportResistance(candles, 20);
  const yr = candles.slice(-240);
  return {
    close: lastC?.close ?? NaN,
    prevClose: prev,
    changePercent: Number.isFinite(prev) && prev !== 0 ? ((lastC.close - prev) / prev) * 100 : NaN,
    volume: lastC?.volume ?? NaN,
    turnover: lastC?.turnover ?? NaN,
    sma20: last(sma(c, 20)),
    sma50: last(sma(c, 50)),
    sma200: last(sma(c, 200)),
    ema20: last(ema(c, 20)),
    ema50: last(ema(c, 50)),
    ema200: last(ema(c, 200)),
    rsi14: last(rsi(c, 14)),
    macd: last(m.macd),
    macdSignal: last(m.signal),
    macdHistogram: last(m.histogram),
    adx14: last(a.adx),
    plusDI: last(a.plusDI),
    minusDI: last(a.minusDI),
    bbUpper: last(bb.upper),
    bbMiddle: last(bb.middle),
    bbLower: last(bb.lower),
    bbBandwidth: last(bb.bandwidth),
    atr14,
    atrPercent: lastC ? (atr14 / lastC.close) * 100 : NaN,
    hv20: last(historicalVolatility(c, 20)),
    roc12: last(roc(c, 12)),
    stochK: last(st.k),
    stochD: last(st.d),
    mfi14: last(mfi(candles, 14)),
    cmf20: last(cmf(candles, 20)),
    obv: last(obv(candles)),
    volumeSma20: vs,
    volumeRatio: lastC && vs > 0 ? lastC.volume / vs : NaN,
    high52w: yr.length ? Math.max(...yr.map((x) => x.high)) : NaN,
    low52w: yr.length ? Math.min(...yr.map((x) => x.low)) : NaN,
    resistance20: sr.resistance[n - 1] ?? NaN,
    support20: sr.support[n - 1] ?? NaN,
  };
}

/** Replace NaN/Infinity with null for JSON transport. */
export function sanitizeNumbers<T extends Record<string, number>>(obj: T): { [K in keyof T]: number | null } {
  const out = {} as { [K in keyof T]: number | null };
  for (const k of Object.keys(obj) as (keyof T)[]) {
    const v = obj[k];
    out[k] = Number.isFinite(v) ? Math.round(v * 10000) / 10000 : null;
  }
  return out;
}
