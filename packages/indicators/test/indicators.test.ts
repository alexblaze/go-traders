import { describe, expect, it } from 'vitest';
import {
  adx, atr, bollinger, cci, cmf, ema, fibonacciRetracement, historicalVolatility, macd, mfi, obv, parabolicSar,
  pivotPoints, roc, rollingSupportResistance, rsi, sma, stochastic, stochRsi, swingPoints, vwap, williamsR, wma,
  computeSnapshot, INDICATORS,
} from '../src';
import { candlesFromCloses, linear } from './fixtures';

// Wilder RSI reference data (StockCharts "RSI" ChartSchool example)
const RSI_CLOSES = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64];

describe('moving averages', () => {
  it('SMA computes rolling mean with NaN warm-up', () => {
    const r = sma([1, 2, 3, 4, 5], 3);
    expect(r[0]).toBeNaN();
    expect(r[1]).toBeNaN();
    expect(r.slice(2)).toEqual([2, 3, 4]);
  });

  it('EMA is seeded with SMA and follows k = 2/(n+1)', () => {
    const r = ema(linear(10, 1), 3);
    expect(r[1]).toBeNaN();
    expect(r[2]).toBeCloseTo(2);
    expect(r[3]).toBeCloseTo(3);
    expect(r[9]).toBeCloseTo(9);
  });

  it('EMA skips leading NaNs from upstream series', () => {
    const r = ema([NaN, NaN, 2, 2, 2, 2], 2);
    expect(r[3]).toBe(2);
    expect(r[2]).toBeNaN();
  });

  it('WMA weights recent values more', () => {
    expect(wma([1, 2, 3], 3)[2]).toBeCloseTo((1 + 4 + 9) / 6);
  });

  it('VWAP equals close for flat candles', () => {
    const c = candlesFromCloses([10, 10, 10, 10]).map((x) => ({ ...x, high: 10, low: 10 }));
    expect(vwap(c, 2)[3]).toBeCloseTo(10);
    expect(vwap(c)[0]).toBeCloseTo(10);
  });
});

describe('RSI', () => {
  it('matches Wilder reference value', () => {
    const r = rsi(RSI_CLOSES, 14);
    expect(r[13]).toBeNaN();
    expect(r[14]).toBeCloseTo(70.46, 2);
    expect(r[15]).toBeCloseTo(66.25, 2);
  });

  it('is 100 in a monotonic uptrend and 0 in a downtrend', () => {
    expect(rsi(linear(30), 14)[29]).toBe(100);
    expect(rsi(linear(30, 100, -1), 14)[29]).toBe(0);
  });

  it('stays within [0,100]', () => {
    const vals = rsi(RSI_CLOSES, 5).filter(Number.isFinite);
    expect(vals.every((v) => v >= 0 && v <= 100)).toBe(true);
  });
});

describe('MACD', () => {
  it('line = EMA(fast) - EMA(slow), histogram = line - signal', () => {
    const closes = linear(60).map((v, i) => v + Math.sin(i / 3) * 5);
    const r = macd(closes, 12, 26, 9);
    const f = ema(closes, 12);
    const s = ema(closes, 26);
    expect(r.macd[40]).toBeCloseTo(f[40] - s[40]);
    expect(r.histogram[50]).toBeCloseTo(r.macd[50] - r.signal[50]);
    expect(r.macd[24]).toBeNaN();
    expect(r.signal[25 + 7]).toBeNaN();
    expect(r.signal[25 + 8]).not.toBeNaN();
  });

  it('is positive in a steady uptrend', () => {
    expect(macd(linear(60)).macd[59]).toBeGreaterThan(0);
  });

  it('rejects fast >= slow', () => {
    expect(() => macd([1, 2, 3], 26, 12)).toThrow();
  });
});

describe('Bollinger Bands', () => {
  it('uses population stdev', () => {
    const r = bollinger([1, 2, 3, 4, 5], 5, 2);
    expect(r.middle[4]).toBe(3);
    expect(r.upper[4]).toBeCloseTo(3 + 2 * Math.SQRT2);
    expect(r.lower[4]).toBeCloseTo(3 - 2 * Math.SQRT2);
  });

  it('collapses on a flat series', () => {
    const r = bollinger(new Array(25).fill(10), 20, 2);
    expect(r.upper[24]).toBe(10);
    expect(r.percentB[24]).toBe(0.5);
  });
});

describe('ADX / ATR', () => {
  it('ADX is high with +DI > -DI in a strong uptrend', () => {
    const c = candlesFromCloses(linear(60, 100, 2));
    const r = adx(c, 14);
    expect(r.adx[26]).toBeNaN();
    expect(r.adx[27]).not.toBeNaN();
    expect(r.adx[59]).toBeGreaterThan(50);
    expect(r.plusDI[59]).toBeGreaterThan(r.minusDI[59]);
  });

  it('ATR of constant-range candles equals the range', () => {
    const c = candlesFromCloses(new Array(30).fill(50));
    expect(atr(c, 14)[29]).toBeCloseTo(2);
  });
});

describe('oscillators', () => {
  const c = candlesFromCloses(linear(40).map((v, i) => v + Math.sin(i) * 3));
  it('stochastic %K within [0,100]', () => {
    const k = stochastic(c).k.filter(Number.isFinite);
    expect(k.length).toBeGreaterThan(0);
    expect(k.every((v) => v >= 0 && v <= 100)).toBe(true);
  });
  it('stoch RSI within [0,100]', () => {
    const k = stochRsi(c.map((x) => x.close)).k.filter(Number.isFinite);
    expect(k.every((v) => v >= 0 && v <= 100)).toBe(true);
  });
  it('Williams %R within [-100,0]', () => {
    const w = williamsR(c).filter(Number.isFinite);
    expect(w.every((v) => v <= 0 && v >= -100)).toBe(true);
  });
  it('ROC in percent', () => {
    expect(roc([100, 110], 1)[1]).toBeCloseTo(10);
  });
  it('CCI finite', () => {
    expect(cci(c, 20).filter(Number.isFinite).length).toBe(21);
  });
  it('Parabolic SAR below price in uptrend', () => {
    const up = candlesFromCloses(linear(30, 100, 2));
    const s = parabolicSar(up);
    expect(s[29]).toBeLessThan(up[29].low);
  });
});

describe('volume indicators', () => {
  it('OBV accumulates signed volume', () => {
    const c = candlesFromCloses([10, 11, 10, 10]);
    expect(obv(c)).toEqual([0, 1000, 0, 0]);
  });
  it('MFI is 100 when money flow only rises', () => {
    expect(mfi(candlesFromCloses(linear(20)), 14)[19]).toBe(100);
  });
  it('CMF in [-1, 1]', () => {
    const v = cmf(candlesFromCloses(linear(30)), 20).filter(Number.isFinite);
    expect(v.every((x) => x >= -1 && x <= 1)).toBe(true);
  });
});

describe('volatility', () => {
  it('historical volatility is 0 for constant growth rate', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 * 1.01 ** i);
    expect(historicalVolatility(closes, 20)[29]).toBeCloseTo(0, 6);
  });
});

describe('levels', () => {
  it('pivot points', () => {
    const p = pivotPoints({ high: 110, low: 90, close: 100 });
    expect(p.pivot).toBe(100);
    expect(p.r1).toBe(110);
    expect(p.s1).toBe(90);
  });
  it('rolling S/R excludes current candle', () => {
    const c = candlesFromCloses([10, 10, 10, 20]);
    const r = rollingSupportResistance(c, 3);
    expect(r.resistance[3]).toBe(11);
  });
  it('swing points detected', () => {
    const closes = [1, 2, 3, 4, 5, 4, 3, 2, 1, 2, 3, 4, 5];
    const pts = swingPoints(candlesFromCloses(closes).map((c) => ({ ...c, high: c.close, low: c.close })), 3);
    expect(pts.some((p) => p.type === 'HIGH' && p.index === 4)).toBe(true);
    expect(pts.some((p) => p.type === 'LOW' && p.index === 8)).toBe(true);
  });
  it('fibonacci levels between low and high', () => {
    const f = fibonacciRetracement(candlesFromCloses(linear(30)), 30)!;
    expect(f.trend).toBe('UP');
    expect(f.levels['0.0']).toBe(f.high);
    expect(f.levels['100.0']).toBe(f.low);
  });
});

describe('registry & snapshot', () => {
  it('every registered indicator returns aligned series', () => {
    const c = candlesFromCloses(linear(80).map((v, i) => v + Math.cos(i / 2) * 4));
    for (const ind of INDICATORS) {
      const out = ind.calculate(c);
      for (const s of Object.values(out)) expect(s.length).toBe(c.length);
    }
  });
  it('snapshot yields NaN when history is insufficient rather than inventing values', () => {
    const s = computeSnapshot(candlesFromCloses(linear(30)));
    expect(s.ema50).toBeNaN();
    expect(s.rsi14).toBe(100);
  });
});
