import type { OHLCV } from '@nepse/shared';
import { cci, roc, rsi, stochastic, stochRsi, williamsR } from './momentum';
import { adx, ema, macd, parabolicSar, sma, vwap, wma } from './trend';
import { atr, bollinger, historicalVolatility, rollingStdev } from './volatility';
import { cmf, mfi, obv, volumeChange, volumeSma } from './volume';
import { rollingSupportResistance } from './levels';
import type { Series } from './util';

export interface Indicator<TInput, TOutput> {
  name: string;
  calculate(data: TInput, parameters?: Record<string, number>): TOutput;
}

export type IndicatorCategory = 'trend' | 'momentum' | 'volatility' | 'volume' | 'levels';

export interface IndicatorDefinition extends Indicator<OHLCV[], Record<string, Series>> {
  id: string;
  category: IndicatorCategory;
  /** Whether it overlays price (vs separate pane). */
  overlay: boolean;
  defaults: Record<string, number>;
}

const closes = (c: OHLCV[]) => c.map((x) => x.close);
const p = (params: Record<string, number> | undefined, defaults: Record<string, number>) => ({ ...defaults, ...params });

function def(
  id: string,
  name: string,
  category: IndicatorCategory,
  overlay: boolean,
  defaults: Record<string, number>,
  fn: (c: OHLCV[], params: Record<string, number>) => Record<string, Series>,
): IndicatorDefinition {
  return { id, name, category, overlay, defaults, calculate: (data, params) => fn(data, p(params, defaults)) };
}

export const INDICATORS: IndicatorDefinition[] = [
  def('sma', 'Simple Moving Average', 'trend', true, { period: 20 }, (c, x) => ({ sma: sma(closes(c), x.period) })),
  def('ema', 'Exponential Moving Average', 'trend', true, { period: 20 }, (c, x) => ({ ema: ema(closes(c), x.period) })),
  def('wma', 'Weighted Moving Average', 'trend', true, { period: 20 }, (c, x) => ({ wma: wma(closes(c), x.period) })),
  def('vwap', 'VWAP (rolling)', 'trend', true, { period: 20 }, (c, x) => ({ vwap: vwap(c, x.period) })),
  def('macd', 'MACD', 'trend', false, { fast: 12, slow: 26, signal: 9 }, (c, x) => {
    const r = macd(closes(c), x.fast, x.slow, x.signal);
    return { macd: r.macd, signal: r.signal, histogram: r.histogram };
  }),
  def('adx', 'ADX / DMI', 'trend', false, { period: 14 }, (c, x) => {
    const r = adx(c, x.period);
    return { adx: r.adx, plusDI: r.plusDI, minusDI: r.minusDI };
  }),
  def('psar', 'Parabolic SAR', 'trend', true, { step: 0.02, max: 0.2 }, (c, x) => ({ psar: parabolicSar(c, x.step, x.max) })),
  def('rsi', 'RSI', 'momentum', false, { period: 14 }, (c, x) => ({ rsi: rsi(closes(c), x.period) })),
  def('stochrsi', 'Stochastic RSI', 'momentum', false, { rsiPeriod: 14, stochPeriod: 14, k: 3, d: 3 }, (c, x) => {
    const r = stochRsi(closes(c), x.rsiPeriod, x.stochPeriod, x.k, x.d);
    return { k: r.k, d: r.d };
  }),
  def('stoch', 'Stochastic Oscillator', 'momentum', false, { k: 14, d: 3, smooth: 3 }, (c, x) => {
    const r = stochastic(c, x.k, x.d, x.smooth);
    return { k: r.k, d: r.d };
  }),
  def('willr', 'Williams %R', 'momentum', false, { period: 14 }, (c, x) => ({ willr: williamsR(c, x.period) })),
  def('roc', 'Rate of Change', 'momentum', false, { period: 12 }, (c, x) => ({ roc: roc(closes(c), x.period) })),
  def('cci', 'Commodity Channel Index', 'momentum', false, { period: 20 }, (c, x) => ({ cci: cci(c, x.period) })),
  def('bb', 'Bollinger Bands', 'volatility', true, { period: 20, stdDev: 2 }, (c, x) => {
    const r = bollinger(closes(c), x.period, x.stdDev);
    return { upper: r.upper, middle: r.middle, lower: r.lower, bandwidth: r.bandwidth, percentB: r.percentB };
  }),
  def('atr', 'Average True Range', 'volatility', false, { period: 14 }, (c, x) => ({ atr: atr(c, x.period) })),
  def('stdev', 'Standard Deviation', 'volatility', false, { period: 20 }, (c, x) => ({ stdev: rollingStdev(closes(c), x.period) })),
  def('hv', 'Historical Volatility (annualised %)', 'volatility', false, { period: 20, periodsPerYear: 240 }, (c, x) => ({
    hv: historicalVolatility(closes(c), x.period, x.periodsPerYear),
  })),
  def('obv', 'On-Balance Volume', 'volume', false, {}, (c) => ({ obv: obv(c) })),
  def('volsma', 'Volume SMA', 'volume', false, { period: 20 }, (c, x) => ({ volumeSma: volumeSma(c, x.period) })),
  def('volchg', 'Volume Change %', 'volume', false, {}, (c) => ({ volumeChange: volumeChange(c) })),
  def('mfi', 'Money Flow Index', 'volume', false, { period: 14 }, (c, x) => ({ mfi: mfi(c, x.period) })),
  def('cmf', 'Chaikin Money Flow', 'volume', false, { period: 20 }, (c, x) => ({ cmf: cmf(c, x.period) })),
  def('sr', 'Rolling Support / Resistance', 'levels', true, { period: 20 }, (c, x) => {
    const r = rollingSupportResistance(c, x.period);
    return { support: r.support, resistance: r.resistance };
  }),
];

const byId = new Map(INDICATORS.map((i) => [i.id, i]));

export function getIndicator(id: string): IndicatorDefinition | undefined {
  return byId.get(id);
}
