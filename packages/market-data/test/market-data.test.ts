import { describe, expect, it } from 'vitest';
import { MarketCalendar, parseTradingDate } from '@nepse/shared';
import { join } from 'node:path';
import {
  checkDataQuality, CsvProvider, DEMO_UNIVERSE, generateSyntheticCandles, MockProvider, NepseProvider, parsePriceCsv, RateLimiter, resample,
} from '../src';

const HEADER = 'symbol,date,open,high,low,close,volume,turnover';

describe('CSV import validation', () => {
  it('accepts the documented example format', () => {
    const r = parsePriceCsv(`${HEADER}\nNABIL,2026-01-01,500,510,495,505,120000,60600000`);
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ symbol: 'NABIL', close: 505, volume: 120000, turnover: 60600000 });
    expect(r.dateRange).toEqual({ from: '2026-01-01', to: '2026-01-01' });
  });

  it('reports each class of error with row numbers', () => {
    const csv = [
      HEADER,
      'NABIL,2026-13-01,500,510,495,505,1,1',
      'NABIL,2026-01-02,abc,510,495,505,1,1',
      'NABIL,2026-01-03,500,510,495,505,-5,1',
      'NABIL,2026-01-04,500,400,495,505,1,1',
      'NABIL,2026-01-05,500,510,495,505,1,1',
      'NABIL,2026-01-05,500,510,495,505,1,1',
      'ZZZZ,2026-01-06,500,510,495,505,1,1',
      'NABIL,2026-01-07,,510,495,505,1,1',
    ].join('\n');
    const r = parsePriceCsv(csv, { knownSymbols: new Set(['NABIL']) });
    const codes = r.errors.map((e) => [e.row, e.code]);
    expect(codes).toEqual([
      [2, 'INVALID_DATE'], [3, 'INVALID_NUMBER'], [4, 'NEGATIVE_VALUE'], [5, 'INVALID_OHLC'], [7, 'DUPLICATE_ROW'], [8, 'UNKNOWN_SYMBOL'], [9, 'MISSING_VALUE'],
    ]);
    expect(r.rows).toHaveLength(1);
  });

  it('rejects files missing required columns', () => {
    const r = parsePriceCsv('symbol,date,close\nNABIL,2026-01-01,5');
    expect(r.errors.map((e) => e.field)).toEqual(['open', 'high', 'low', 'volume']);
  });

  it('flags anomalies and existing records as warnings without altering data', () => {
    const r = parsePriceCsv(`${HEADER}\nA,2026-01-01,100,101,99,100,1,1\nA,2026-01-02,130,131,129,130,1,1`, { existingKeys: new Set(['A|2026-01-01']) });
    expect(r.rows[1].close).toBe(130);
    expect(r.warnings.map((w) => w.code).sort()).toEqual(['ANOMALY', 'EXISTING_RECORD']);
  });
});

describe('data quality', () => {
  it('flags problems instead of fixing them', () => {
    const d = (s: string) => parseTradingDate(s)!;
    const candles = [
      { date: d('2026-09-27'), open: 10, high: 11, low: 9, close: 10, volume: 5 },
      { date: d('2026-09-27'), open: 10, high: 11, low: 9, close: 10, volume: 5 },
      { date: d('2026-09-30'), open: 10, high: 9, low: 9, close: 20, volume: -1 },
    ];
    const r = checkDataQuality(candles, { calendar: new MarketCalendar() });
    const codes = r.flags.map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(['DUPLICATE_CANDLE', 'INVALID_OHLC', 'NEGATIVE_VOLUME', 'EXTREME_MOVE', 'MISSING_DATE']));
    expect(r.missingDates).toEqual(['2026-09-28', '2026-09-29']);
    expect(r.ok).toBe(false);
    expect(candles[2].high).toBe(9);
  });
});

describe('providers', () => {
  it('synthetic candles are deterministic, valid and respect circuit limits', () => {
    const range = { from: new Date('2025-01-01T00:00:00Z'), to: new Date('2025-12-31T00:00:00Z') };
    const a = generateSyntheticCandles(DEMO_UNIVERSE[0], range);
    const b = generateSyntheticCandles(DEMO_UNIVERSE[0], range);
    expect(a).toEqual(b);
    expect(checkDataQuality(a).flags.filter((f) => f.code !== 'ZERO_VOLUME')).toEqual([]);
    for (let i = 1; i < a.length; i++) expect(Math.abs(a[i].close / a[i - 1].close - 1)).toBeLessThanOrEqual(0.1001);
  });

  it('mock provider is labelled MOCK', async () => {
    const p = new MockProvider();
    const q = await p.getQuote('DMCB1');
    expect(q.source).toBe('MOCK');
    expect((await p.getSymbols()).every((s) => s.isDemo)).toBe(true);
    const s = await p.getMarketSummary();
    expect(s.advancers + s.decliners + s.unchanged).toBe(DEMO_UNIVERSE.length);
  });

  it('CSV provider reads the sample folder and labels it DEMO', async () => {
    const p = new CsvProvider(join(__dirname, '../../../data/sample'));
    const syms = await p.getSymbols();
    expect(syms.length).toBe(DEMO_UNIVERSE.length);
    expect(p.source).toBe('DEMO');
    const h = await p.getHistoricalPrices('DMCB1', new Date('2026-01-01'), new Date('2026-03-01'), '1D');
    expect(h.length).toBeGreaterThan(30);
    const w = await p.getHistoricalPrices('DMCB1', new Date('2026-01-01'), new Date('2026-03-01'), '1W');
    expect(w.length).toBeLessThan(h.length);
  });

  it('NEPSE provider validates payloads and applies auth header', async () => {
    const calls: RequestInit[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      calls.push(init);
      return new Response(JSON.stringify({ symbol: 'NABIL', price: 510, previousClose: 500, volume: 10, timestamp: '2026-09-28T09:15:00Z' }), { status: 200 });
    }) as unknown as typeof fetch;
    const p = new NepseProvider({ baseUrl: 'https://example.invalid/api', apiKey: 'k', fetchImpl });
    const q = await p.getQuote('NABIL');
    expect(q.changePercent).toBeCloseTo(2);
    expect(q.source).toBe('LIVE');
    expect((calls[0].headers as Record<string, string>).Authorization).toBe('Bearer k');

    const bad = new NepseProvider({ baseUrl: 'https://x.invalid', fetchImpl: (async () => new Response('{"nope":1}')) as unknown as typeof fetch });
    await expect(bad.getQuote('NABIL')).rejects.toThrow(/unexpected payload/);
  });

  it('resamples to weekly candles', () => {
    const c = [0, 1, 2, 3, 4, 7].map((i) => ({ date: new Date(Date.UTC(2026, 8, 27 + i)), open: 1 + i, high: 10 + i, low: 1, close: 2 + i, volume: 1 }));
    const w = resample(c, '1W');
    expect(w).toHaveLength(2);
    expect(w[0]).toMatchObject({ open: 1, close: 6, high: 14, volume: 5 });
  });
});

describe('rate limiter', () => {
  it('limits requests per minute', () => {
    let t = 0;
    const l = new RateLimiter(2, () => t);
    expect(l.tryAcquire()).toBe(0);
    expect(l.tryAcquire()).toBe(0);
    expect(l.tryAcquire()).toBeGreaterThan(0);
    t += 30000;
    expect(l.tryAcquire()).toBe(0);
  });
});
