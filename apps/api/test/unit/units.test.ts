import { evaluateAlert } from '@nepse/database';
import { describe, expect, it } from 'vitest';
import { toCsv } from '../../src/lib/export';
import { templateStockAnswer } from '../../src/modules/ai/template-analyst';
import type { StockContext } from '../../src/modules/ai/context';

describe('alert evaluation', () => {
  const base = { threshold: null, strategyId: null };
  it('price crossing requires an actual cross', () => {
    expect(evaluateAlert({ ...base, type: 'PRICE_ABOVE', threshold: 100 }, { cur: { close: 101 }, prev: { close: 99 }, signals: [] }).triggered).toBe(true);
    expect(evaluateAlert({ ...base, type: 'PRICE_ABOVE', threshold: 100 }, { cur: { close: 101 }, prev: { close: 100.5 }, signals: [] }).triggered).toBe(false);
  });
  it('EMA and MACD crossovers', () => {
    expect(evaluateAlert({ ...base, type: 'EMA_CROSSOVER_BULLISH' }, { cur: { ema20: 11, ema50: 10 }, prev: { ema20: 9, ema50: 10 }, signals: [] }).triggered).toBe(true);
    expect(evaluateAlert({ ...base, type: 'MACD_CROSSOVER_BEARISH' }, { cur: { macd: -1, macdSignal: 0 }, prev: { macd: 1, macdSignal: 0 }, signals: [] }).triggered).toBe(true);
  });
  it('missing data never triggers', () => {
    expect(evaluateAlert({ ...base, type: 'RSI_BELOW', threshold: 30 }, { cur: { rsi14: null }, signals: [] }).triggered).toBe(false);
  });
  it('signal alerts respect strategy and min strength', () => {
    const signals = [{ strategyId: 'ensemble', signal: 'BUY' as const, strength: 60 }];
    expect(evaluateAlert({ type: 'BUY_SIGNAL', threshold: 50, strategyId: null }, { cur: {}, signals }).triggered).toBe(true);
    expect(evaluateAlert({ type: 'BUY_SIGNAL', threshold: 70, strategyId: null }, { cur: {}, signals }).triggered).toBe(false);
    expect(evaluateAlert({ type: 'SELL_SIGNAL', threshold: null, strategyId: null }, { cur: {}, signals }).triggered).toBe(false);
  });
});

describe('CSV export', () => {
  it('escapes quotes and neutralises spreadsheet formulas', () => {
    const csv = toCsv([{ a: '=HYPERLINK("x")', b: 'x,y', c: -5 }]);
    expect(csv).toBe('a,b,c\n"\'=HYPERLINK(""x"")","x,y",-5\n');
  });
});

describe('template analyst', () => {
  const ctx: StockContext = {
    kind: 'stock', symbol: 'TEST', companyName: 'Test', sector: null, dataSource: 'DEMO (synthetic)', isDemo: true, dataTimestamp: '2026-09-28 (end-of-day candle, NPT)',
    observed: { close: 100, prevClose: 99, changePercent: 1.01, volume: 1000, turnover: 100000, volumeSma20: 800, volumeRatio: 1.25 },
    indicators: { ema20: 98, ema50: 95, ema200: 90, sma50: 95, rsi14: 72, macd: 1, macdSignal: 0.5, macdHistogram: 0.5, adx14: 28, plusDI: 25, minusDI: 12, bbUpper: 104, bbMiddle: 97, bbLower: 90, atr14: 2, atrPercent: 2, hv20: 45, roc12: 5, mfi14: 60, cmf20: 0.1 },
    previousIndicators: {}, levels: { support20: 90, resistance20: 101, pivots: null, fibonacci: null, high52w: 110, low52w: 70 },
    marketRegime: 'UPTREND', stockRegime: 'UPTREND', strategySignals: [{ strategy: 'MACD', signal: 'BUY', strength: 70, reasons: [{ direction: 'BULLISH', condition: 'MACD crossed above signal line' }] }],
    consensus: { bullish: 5, neutral: 3, bearish: 1 }, ensemble: { signal: 'BUY', strength: 72, primaryReasons: ['EMA trend positive'], conflictingFactors: ['RSI elevated'] }, historicalStats: null,
  };
  it('produces required sections, flags risks and never calls strength a probability', () => {
    const a = templateStockAnswer(ctx, 'Why is TEST bullish?');
    for (const h of ['## Summary', '## Observed Data', '## Indicators', '## Strategy Signals', '## Historical Context', '## Risk Factors', '## Uncertainty', '## Data Timestamp']) expect(a).toContain(h);
    expect(a).toMatch(/within 2% of 20-day resistance/);
    expect(a).toMatch(/Momentum may be extended/);
    expect(a).toMatch(/Volatility is elevated/);
    expect(a).toMatch(/SYNTHETIC DEMO/);
    expect(a).not.toMatch(/probability of (profit|success)(?! )/i);
    expect(a).toMatch(/not a probability/);
  });
});
