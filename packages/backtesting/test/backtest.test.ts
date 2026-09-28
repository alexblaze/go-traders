import { describe, expect, it } from 'vitest';
import type { OHLCV, SignalType } from '@nepse/shared';
import { buildSignal, emaCrossover, type TradingStrategy } from '@nepse/strategies';
import {
  analyzeSignalOutcomes, calculateFees, DataIntegrityError, flatCommission, ILLUSTRATIVE_NEPAL_FEES, maxDrawdownPct, parameterCombinations,
  runBacktest, walkForward, type FeeSchedule,
} from '../src';

const day = (i: number) => new Date(Date.UTC(2025, 0, 1 + i));

/** open = 100 + i, close = open + 0.5 */
function ramp(n: number): OHLCV[] {
  return Array.from({ length: n }, (_, i) => ({ date: day(i), open: 100 + i, high: 101 + i, low: 99 + i, close: 100.5 + i, volume: 1_000_000 }));
}

/** Strategy that emits scripted signals by bar index (its only input is candles.length). */
function scripted(script: Record<number, SignalType>, seen?: number[]): TradingStrategy {
  return {
    id: 'scripted', name: 'Scripted', description: '', category: 'custom', parameters: [], indicatorsUsed: [], assumptions: [], limitations: [],
    minCandles: () => 1,
    generateSignal(c, ctx) {
      seen?.push(c.length);
      return buildSignal('scripted', c, ctx, script[c.length - 1] ?? 'HOLD', 50, [], {});
    },
  };
}

const base = { symbol: 'TEST', initialCapital: 100_000, positionSize: 1, slippageBps: 0, feeSchedules: [] as FeeSchedule[] };

describe('execution model', () => {
  it('fills on the NEXT bar open (no same-bar look-ahead)', () => {
    const r = runBacktest(ramp(10), scripted({ 2: 'BUY', 5: 'SELL' }), base);
    expect(r.trades).toHaveLength(1);
    const t = r.trades[0];
    expect(t.entryDate).toEqual(day(3));
    expect(t.entryPrice).toBe(103);
    expect(t.exitDate).toEqual(day(6));
    expect(t.exitPrice).toBe(106);
    expect(t.quantity).toBe(Math.floor(100_000 / 103));
    expect(t.grossPnl).toBeCloseTo(t.quantity * 3, 6);
  });

  it('applies slippage against the trader on both sides', () => {
    const r = runBacktest(ramp(10), scripted({ 2: 'BUY', 5: 'SELL' }), { ...base, slippageBps: 100 });
    expect(r.trades[0].entryPrice).toBeCloseTo(103 * 1.01, 6);
    expect(r.trades[0].exitPrice).toBeCloseTo(106 * 0.99, 6);
  });

  it('deducts fees and computes net P&L exactly', () => {
    const r = runBacktest(ramp(10), scripted({ 2: 'BUY', 5: 'SELL' }), { ...base, feeSchedules: flatCommission(0.01) });
    const t = r.trades[0];
    const q = t.quantity;
    expect(q * 103 * 1.01).toBeLessThanOrEqual(100_000);
    const buyFee = Math.round(q * 103 * 0.01 * 100) / 100;
    const sellFee = Math.round(q * 106 * 0.01 * 100) / 100;
    expect(t.fees).toBeCloseTo(buyFee + sellFee, 2);
    expect(t.netPnl).toBeCloseTo(q * 3 - buyFee - sellFee, 2);
    expect(r.metrics.finalEquity).toBeCloseTo(100_000 + t.netPnl, 2);
    expect(r.metrics.totalFees).toBeCloseTo(t.fees, 2);
  });

  it('equity curve marks to market at each close', () => {
    const r = runBacktest(ramp(6), scripted({ 0: 'BUY' }), base);
    const q = r.trades[0].quantity;
    const cash = 100_000 - q * 101;
    expect(r.equityCurve[0].equity).toBe(100_000);
    expect(r.equityCurve[1].equity).toBeCloseTo(cash + q * 101.5, 4);
    expect(r.equityCurve[2].positionValue).toBeCloseTo(q * 102.5, 4);
    expect(r.trades[0].exitReason).toBe('END_OF_DATA');
  });

  it('fill mode close is available but explicit', () => {
    const r = runBacktest(ramp(10), scripted({ 2: 'BUY', 5: 'SELL' }), { ...base, fillMode: 'close' });
    expect(r.trades[0].entryPrice).toBe(102.5);
    expect(r.trades[0].entryDate).toEqual(day(2));
  });

  it('stop loss triggers intrabar with gap handling', () => {
    const c = ramp(10);
    c[5] = { ...c[5], open: 90, low: 85, high: 95, close: 92 };
    const r = runBacktest(c, scripted({ 2: 'BUY' }), { ...base, stopLossPct: 5 });
    const t = r.trades[0];
    expect(t.exitReason).toBe('STOP_LOSS');
    expect(t.exitPrice).toBe(90); // gapped below the 97.85 stop → filled at the open
  });

  it('respects liquidity participation limit', () => {
    const c = ramp(10).map((x) => ({ ...x, volume: 100 }));
    const r = runBacktest(c, scripted({ 2: 'BUY', 5: 'SELL' }), { ...base, maxVolumeParticipation: 0.1 });
    expect(r.trades[0].quantity).toBe(10);
  });
});

describe('look-ahead / leakage protection', () => {
  it('strategy only ever sees candles up to the current bar', () => {
    const seen: number[] = [];
    runBacktest(ramp(20), scripted({}, seen), base);
    expect(seen).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('future data does not change past decisions', () => {
    const c = ramp(60).map((x, i) => ({ ...x, close: x.open + Math.sin(i) * 0.4, high: x.open + 1, low: x.open - 1 }));
    const a = runBacktest(c.slice(0, 40), emaCrossover, { ...base, strategyParameters: { fast: 3, slow: 8 } });
    const b = runBacktest(c, emaCrossover, { ...base, strategyParameters: { fast: 3, slow: 8 } });
    const closedA = a.trades.filter((t) => t.exitReason !== 'END_OF_DATA');
    expect(b.trades.slice(0, closedA.length)).toEqual(closedA);
    expect(b.signals.slice(0, a.signals.length)).toEqual(a.signals);
  });

  it('rejects incorrectly ordered candles', () => {
    const c = ramp(5);
    [c[1], c[2]] = [c[2], c[1]];
    expect(() => runBacktest(c, scripted({}), base)).toThrow(DataIntegrityError);
  });

  it('rejects duplicate candles', () => {
    const c = ramp(5);
    c[3] = { ...c[3], date: c[2].date };
    expect(() => runBacktest(c, scripted({}), base)).toThrow(/Duplicate/);
  });

  it('rejects invalid OHLC', () => {
    const c = ramp(5);
    c[2] = { ...c[2], high: 50 };
    expect(() => runBacktest(c, scripted({}), base)).toThrow(/Invalid OHLC/);
  });
});

describe('metrics', () => {
  it('max drawdown', () => {
    expect(maxDrawdownPct([100, 120, 90, 130, 65])).toBeCloseTo(50);
  });

  it('drawdown curve and win/loss stats', () => {
    const c = ramp(30);
    c[13] = { ...c[13], open: 80, low: 79, high: 81, close: 80.5 };
    const r = runBacktest(c, scripted({ 2: 'BUY', 5: 'SELL', 10: 'BUY', 12: 'SELL', 20: 'BUY', 25: 'SELL' }), base);
    expect(r.metrics.numberOfTrades).toBe(3);
    expect(r.metrics.maxConsecutiveLosses).toBe(1);
    expect(r.metrics.winRatePct).toBeCloseTo(66.67, 1);
    expect(Math.max(...r.equityCurve.map((p) => p.drawdownPct))).toBeCloseTo(r.metrics.maxDrawdownPct, 1);
    expect(r.monthlyReturns[0].month).toBe('2025-01');
    expect(r.warnings.join(' ')).toMatch(/does not guarantee/);
  });
});

describe('fees', () => {
  it('uses tiered, date-effective schedules', () => {
    const f = calculateFees({ side: 'BUY', amount: 100_000, date: new Date('2026-01-01') }, ILLUSTRATIVE_NEPAL_FEES);
    expect(f.lines.find((l) => l.type === 'BROKER_COMMISSION')!.amount).toBeCloseTo(330);
    expect(f.lines.find((l) => l.type === 'SEBON_FEE')!.amount).toBeCloseTo(15);
    expect(f.lines.some((l) => l.type === 'DP_CHARGE')).toBe(false);
  });

  it('selects schedule by trade date', () => {
    const schedules: FeeSchedule[] = [
      { id: 'old', name: 'old', type: 'BROKER_COMMISSION', rate: 0.01, fixedAmount: 0, appliesTo: 'BOTH', effectiveFrom: new Date('2020-01-01'), effectiveTo: new Date('2024-12-31') },
      { id: 'new', name: 'new', type: 'BROKER_COMMISSION', rate: 0.005, fixedAmount: 0, appliesTo: 'BOTH', effectiveFrom: new Date('2025-01-01'), effectiveTo: null },
    ];
    expect(calculateFees({ side: 'BUY', amount: 1000, date: new Date('2024-06-01') }, schedules).total).toBe(10);
    expect(calculateFees({ side: 'BUY', amount: 1000, date: new Date('2025-06-01') }, schedules).total).toBe(5);
  });

  it('capital gains tax only on realised gains and by holding period', () => {
    const d = new Date('2026-01-01');
    const short = calculateFees({ side: 'SELL', amount: 10000, date: d, realizedGain: 1000, entryDate: new Date('2025-12-01') }, ILLUSTRATIVE_NEPAL_FEES);
    expect(short.lines.find((l) => l.type === 'CAPITAL_GAINS_TAX')!.amount).toBeCloseTo(75);
    const long = calculateFees({ side: 'SELL', amount: 10000, date: d, realizedGain: 1000, entryDate: new Date('2024-01-01') }, ILLUSTRATIVE_NEPAL_FEES);
    expect(long.lines.find((l) => l.type === 'CAPITAL_GAINS_TAX')!.amount).toBeCloseTo(50);
    const loss = calculateFees({ side: 'SELL', amount: 10000, date: d, realizedGain: -500 }, ILLUSTRATIVE_NEPAL_FEES);
    expect(loss.lines.some((l) => l.type === 'CAPITAL_GAINS_TAX')).toBe(false);
    expect(loss.lines.find((l) => l.type === 'DP_CHARGE')!.amount).toBe(25);
  });
});

describe('walk-forward & signal outcomes', () => {
  const wave = Array.from({ length: 300 }, (_, i) => {
    const p = 200 + Math.sin(i / 15) * 30 + i * 0.1;
    return { date: day(i), open: p, high: p + 2, low: p - 2, close: p + 0.5, volume: 100000 };
  });

  it('parameter grid combos', () => {
    expect(parameterCombinations({ a: [1, 2], b: [3, 4, 5] })).toHaveLength(6);
  });

  it('walk-forward selects params in-sample and evaluates out-of-sample', () => {
    const r = walkForward(wave, emaCrossover, base, { grid: { fast: [5, 10], slow: [20, 30] }, trainBars: 120, testBars: 60 });
    expect(r.folds.length).toBe(3);
    for (const f of r.folds) expect(f.testFrom.getTime()).toBeGreaterThan(f.trainTo.getTime());
  });

  it('signal outcomes are sign-adjusted and null when future is unknown', () => {
    const s = analyzeSignalOutcomes(wave, emaCrossover, 'TEST', [5, 20], { fast: 5, slow: 20 });
    expect(s.signals).toBeGreaterThan(0);
    const lastO = s.outcomes[s.outcomes.length - 1];
    if (wave.length - 1 - wave.findIndex((c) => c.date.getTime() === lastO.date.getTime()) < 20) expect(lastO.forwardReturns[20]).toBeNull();
    expect(s.label).toMatch(/Historical observation/);
  });
});
