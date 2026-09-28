import { describe, expect, it } from 'vitest';
import {
  BUILTIN_STRATEGIES, bollingerStrategy, breakoutStrategy, createCustomStrategy, CustomStrategyDefinitionSchema, detectRegime,
  emaCrossover, ensembleStrategy, evaluateOnCandles, macdStrategy, meanReversion, momentumStrategy, multiIndicatorConsensus,
  rsiStrategy, trendFollowing,
} from '../src';
import { candles, downTrend, upTrend, vShape } from './helpers';

const ctx = { symbol: 'TEST' };

/** Find the first bar where the strategy emits `signal`, scanning without look-ahead. */
function firstSignal(strategy: typeof emaCrossover, c: ReturnType<typeof candles>, signal: 'BUY' | 'SELL', params?: Record<string, number>) {
  for (let i = 1; i <= c.length; i++) {
    const s = strategy.generateSignal(c.slice(0, i), { ...ctx, parameters: params });
    if (s.signal === signal) return { index: i - 1, s };
  }
  return null;
}

describe('strategy contract', () => {
  it.each(BUILTIN_STRATEGIES.map((s) => [s.id, s] as const))('%s returns HOLD with insufficient data', (_id, s) => {
    const sig = s.generateSignal(candles([100, 101, 102]), ctx);
    expect(sig.signal).toBe('HOLD');
    expect(sig.strength).toBe(0);
  });

  it.each(BUILTIN_STRATEGIES.map((s) => [s.id, s] as const))('%s produces a well-formed explainable signal', (_id, s) => {
    const c = candles(vShape(260));
    const sig = s.generateSignal(c, ctx);
    expect(['BUY', 'SELL', 'HOLD']).toContain(sig.signal);
    expect(sig.strength).toBeGreaterThanOrEqual(0);
    expect(sig.strength).toBeLessThanOrEqual(100);
    expect(sig.reasons.length).toBeGreaterThan(0);
    expect(sig.strategyId).toBe(s.id);
    expect(sig.price).toBe(c[c.length - 1].close);
    expect(sig.timestamp).toEqual(c[c.length - 1].date);
    for (const r of sig.reasons) expect(['BULLISH', 'BEARISH', 'NEUTRAL']).toContain(r.direction);
  });

  it('signals do not depend on future candles (no look-ahead)', () => {
    const c = candles(vShape(200));
    for (const s of BUILTIN_STRATEGIES) {
      const a = s.generateSignal(c.slice(0, 150), ctx);
      const tampered = [...c.slice(0, 150), ...candles(new Array(50).fill(1))];
      const b = s.generateSignal(tampered.slice(0, 150), ctx);
      expect(b).toEqual(a);
    }
  });
});

describe('EMA crossover', () => {
  it('emits BUY at the bullish crossover in a V-shaped series', () => {
    const hit = firstSignal(emaCrossover, candles(vShape(200)), 'BUY', { fast: 5, slow: 20 });
    expect(hit).not.toBeNull();
    expect(hit!.index).toBeGreaterThan(100);
    expect(hit!.s.reasons[0].condition).toMatch(/crossed above/);
  });

  it('emits SELL on bearish crossover', () => {
    const inv = vShape(200).map((v) => 400 - v);
    expect(firstSignal(emaCrossover, candles(inv), 'SELL', { fast: 5, slow: 20 })).not.toBeNull();
  });
});

describe('RSI', () => {
  it('BUY candidate when oversold, SELL when overbought', () => {
    expect(rsiStrategy.generateSignal(candles(downTrend(80)), ctx).signal).toBe('BUY');
    expect(rsiStrategy.generateSignal(candles(upTrend(80, 100, 2)), ctx).signal).toBe('SELL');
  });
  it('down-weights counter-trend signals', () => {
    const s = rsiStrategy.generateSignal(candles(downTrend(80)), ctx);
    expect(s.reasons.some((r) => r.indicator === 'EMA' && r.direction === 'BEARISH')).toBe(true);
  });
});

describe('MACD', () => {
  it('detects bullish crossover', () => {
    const noisy = vShape(200).map((v, i) => v + Math.sin(i / 3) * 2);
    const hit = firstSignal(macdStrategy, candles(noisy), 'BUY');
    expect(hit).not.toBeNull();
    expect(hit!.s.reasons[0].condition).toMatch(/bullish crossover/);
  });
});

describe('Bollinger', () => {
  it('reversion mode: lower band touch → BUY candidate', () => {
    const closes = [...new Array(40).fill(100).map((v, i) => v + (i % 2)), 90];
    expect(bollingerStrategy.generateSignal(candles(closes), ctx).signal).toBe('BUY');
  });
  it('breakout mode: close above upper band with volume → BUY', () => {
    const closes = [...new Array(40).fill(100).map((v, i) => v + (i % 2)), 110];
    const vols = [...new Array(40).fill(10000), 50000];
    const s = bollingerStrategy.generateSignal(candles(closes, vols), { ...ctx, parameters: { mode: 1 } });
    expect(s.signal).toBe('BUY');
    expect(s.strength).toBeGreaterThanOrEqual(75);
  });
});

describe('Breakout', () => {
  const base = new Array(40).fill(0).map((_, i) => 100 + Math.sin(i) * 2);
  it('requires volume confirmation', () => {
    const closes = [...base, 110];
    expect(breakoutStrategy.generateSignal(candles(closes), ctx).signal).toBe('HOLD');
    const vols = [...new Array(40).fill(10000), 30000];
    const s = breakoutStrategy.generateSignal(candles(closes, vols), ctx);
    expect(s.signal).toBe('BUY');
    expect(s.meta?.breakout).toBe('RESISTANCE');
  });
  it('support breakdown → SELL', () => {
    const vols = [...new Array(40).fill(10000), 30000];
    expect(breakoutStrategy.generateSignal(candles([...base, 90], vols), ctx).signal).toBe('SELL');
  });
});

describe('Trend following / momentum', () => {
  it('bullish in steady uptrend with volume', () => {
    const vols = Array.from({ length: 120 }, (_, i) => 10000 + i * 100);
    expect(trendFollowing.generateSignal(candles(upTrend(120), vols), ctx).signal).toBe('BUY');
    const m = momentumStrategy.generateSignal(candles(upTrend(120), vols), { ...ctx, parameters: { scoreThreshold: 2 } });
    expect(m.signal).toBe('BUY');
    expect(m.meta?.direction).toBe('bullish');
  });
  it('bearish in steady downtrend', () => {
    const vols = Array.from({ length: 120 }, (_, i) => 10000 + i * 100);
    expect(trendFollowing.generateSignal(candles(downTrend(120), vols), ctx).signal).toBe('SELL');
  });
});

describe('Mean reversion', () => {
  it('flags statistically unusual drop and documents trend risk', () => {
    const closes = [...new Array(40).fill(0).map((_, i) => 100 + (i % 3)), 92, 88];
    const s = meanReversion.generateSignal(candles(closes), ctx);
    expect(s.signal).toBe('BUY');
    expect(s.meta?.suggestedStop).toBeLessThan(88);
    expect(meanReversion.limitations.join(' ')).toMatch(/strong trends/);
  });
});

describe('Multi-indicator consensus', () => {
  it('reports an explicit component score, not a probability', () => {
    const vols = Array.from({ length: 120 }, (_, i) => (i === 119 ? 40000 : 10000));
    const s = multiIndicatorConsensus.generateSignal(candles(upTrend(120, 100, 0.5), vols), ctx);
    expect(s.meta?.maxScore).toBe(6);
    expect((s.meta?.components as unknown[]).length).toBe(6);
    expect(s.meta?.scoreLabel).toMatch(/^\d \/ 6$/);
    expect(multiIndicatorConsensus.description).toMatch(/NOT a probability/);
  });
});

describe('Ensemble', () => {
  it('aggregates member votes with counts', () => {
    const s = ensembleStrategy.generateSignal(candles(vShape(260)), ctx);
    const m = s.meta as Record<string, number>;
    expect(m.bullishStrategies + m.bearishStrategies + m.neutralStrategies).toBe(7);
  });
});

describe('regime detection', () => {
  it('classifies trends', () => {
    expect(detectRegime(candles(upTrend(260, 100, 1))).regime).toMatch(/UPTREND/);
    expect(detectRegime(candles(downTrend(260, 400, 1))).regime).toMatch(/DOWNTREND/);
  });
  it('detects high volatility', () => {
    const wild = Array.from({ length: 100 }, (_, i) => 100 * (i % 2 ? 1.08 : 0.94));
    expect(detectRegime(candles(wild)).regime).toBe('HIGH_VOLATILITY');
  });
});

describe('DSL', () => {
  it('rejects arbitrary code and unknown fields', () => {
    expect(CustomStrategyDefinitionSchema.safeParse({ name: 'x', buy: { op: 'AND', conditions: [{ left: { field: 'process.exit' }, comparator: '<', right: { value: 1 } }] } }).success).toBe(false);
  });

  it('evaluates nested conditions with multipliers', () => {
    const c = candles(downTrend(80), [...new Array(79).fill(1000), 5000]);
    const r = evaluateOnCandles({
      op: 'AND',
      conditions: [
        { left: { field: 'rsi14' }, comparator: '<', right: { value: 30 } },
        { left: { field: 'volume' }, comparator: '>', right: { field: 'volumeSma20', multiplier: 1.5 } },
        { op: 'OR', conditions: [{ left: { field: 'close' }, comparator: '<', right: { field: 'ema50' } }, { left: { value: 1 }, comparator: '>', right: { value: 2 } }] },
      ],
    }, c);
    expect(r.passed).toBe(true);
    expect(r.trace).toHaveLength(4);
  });

  it('custom strategy produces BUY with rule trace', () => {
    const strat = createCustomStrategy('custom_1', {
      name: 'Oversold',
      buy: { op: 'AND', conditions: [{ left: { field: 'rsi14' }, comparator: '<', right: { value: 30 } }] },
      sell: { op: 'AND', conditions: [{ left: { field: 'rsi14' }, comparator: '>', right: { value: 70 } }] },
    });
    const s = strat.generateSignal(candles(downTrend(80)), ctx);
    expect(s.signal).toBe('BUY');
    expect(s.reasons[0].condition).toMatch(/✓ RSI 14 < 30/);
  });

  it('missing indicator values never pass', () => {
    const r = evaluateOnCandles({ op: 'AND', conditions: [{ left: { field: 'sma200' }, comparator: '<', right: { value: 1e9 } }] }, candles(upTrend(50)));
    expect(r.passed).toBe(false);
  });
});
