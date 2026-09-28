import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => (ctx = await createTestApp()));
afterAll(async () => ctx.close());

describe('health', () => {
  it('reports readiness of database and redis', async () => {
    const r = await ctx.app.inject({ url: '/ready' });
    expect(r.statusCode).toBe(200);
    expect(r.json().checks.database.ok).toBe(true);
    expect(r.json().checks.redis.ok).toBe(true);
  });
  it('serves OpenAPI docs', async () => {
    const r = await ctx.app.inject({ url: '/docs/json' });
    expect(r.statusCode).toBe(200);
    expect(Object.keys(r.json().paths)).toEqual(expect.arrayContaining(['/api/v1/stocks/{symbol}/signals', '/api/v1/backtests']));
  });
});

describe('stocks & market', () => {
  it('lists and searches stocks with latest prices', async () => {
    const r = await ctx.app.inject({ url: '/api/v1/stocks?search=DMCB&pageSize=5' });
    const body = r.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(3);
    expect(body.data[0]).toMatchObject({ isDemo: true, dataSource: 'DEMO' });
    expect(body.data[0].close).toBeGreaterThan(0);
    expect(body.meta.total).toBe(3);
  });

  it('returns detail with N/A fundamentals rather than invented data', async () => {
    const r = await ctx.app.inject({ url: '/api/v1/stocks/dmcb1' });
    expect(r.json().data).toMatchObject({ symbol: 'DMCB1', paidUpCapital: 'N/A', dataSource: 'DEMO' });
  });

  it('uses the documented error format for unknown symbols', async () => {
    const r = await ctx.app.inject({ url: '/api/v1/stocks/NOPE/history' });
    expect(r.statusCode).toBe(404);
    expect(r.json()).toMatchObject({ success: false, error: { code: 'INVALID_SYMBOL', message: 'The requested stock symbol was not found.' } });
  });

  it('returns candles by range and timeframe', async () => {
    const d = (await ctx.app.inject({ url: '/api/v1/stocks/DMCB1/history?range=3M' })).json().data;
    const w = (await ctx.app.inject({ url: '/api/v1/stocks/DMCB1/history?range=3M&timeframe=1W' })).json().data;
    expect(d.candles.length).toBeGreaterThan(50);
    expect(w.candles.length).toBeLessThan(d.candles.length);
    const dates = d.candles.map((c: { date: string }) => c.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it('returns indicator series aligned with dates', async () => {
    const r = (await ctx.app.inject({ url: '/api/v1/stocks/DMCB1/indicators?ids=ema,rsi,macd&range=6M&params=' + encodeURIComponent('{"ema":{"period":50}}') })).json().data;
    expect(r.series.ema.ema.length).toBe(r.dates.length);
    expect(r.series.rsi.rsi.every((v: number | null) => v === null || (v >= 0 && v <= 100))).toBe(true);
    expect(r.series.ema.ema[0]).not.toBeNull(); // warm-up history loaded before range start
  });

  it('generates and persists explainable signals', async () => {
    const r = (await ctx.app.inject({ url: '/api/v1/stocks/DMCB1/signals' })).json().data;
    expect(r.strategies.length).toBe(10);
    expect(r.overall.strategyId).toBe('ensemble');
    for (const s of r.strategies) {
      expect(['BUY', 'SELL', 'HOLD']).toContain(s.signal);
      expect(s.reasons.length).toBeGreaterThan(0);
      expect(s.timeframe).toBe('1D');
      expect(s.strengthNote).toMatch(/not a probability/);
    }
    expect(r.agreement.bullish + r.agreement.neutral + r.agreement.bearish).toBe(9);
    const hist = (await ctx.app.inject({ url: '/api/v1/stocks/DMCB1/signals/history?strategy=rsi' })).json();
    expect(hist.meta.total).toBeGreaterThanOrEqual(1);
  });

  it('market summary, sectors, trending and regime', async () => {
    const s = (await ctx.app.inject({ url: '/api/v1/market/summary' })).json().data;
    expect(s.dataSources).toContain('DEMO');
    expect(s.index.isDerived).toBe(true);
    expect(s.totals.advancers + s.totals.decliners + s.totals.unchanged).toBe(s.totals.stocksTraded);
    const sec = (await ctx.app.inject({ url: '/api/v1/market/sectors?period=1M' })).json().data;
    expect(sec.sectors.reduce((a: number, x: { companies: number }) => a + x.companies, 0)).toBe(18);
    const t = (await ctx.app.inject({ url: '/api/v1/market/trending?category=highest_volume&limit=5' })).json().data;
    expect(t.items).toHaveLength(5);
    expect(t.items[0].volume).toBeGreaterThanOrEqual(t.items[4].volume);
    const reg = (await ctx.app.inject({ url: '/api/v1/market/regime' })).json().data;
    expect(['STRONG_UPTREND', 'UPTREND', 'SIDEWAYS', 'DOWNTREND', 'STRONG_DOWNTREND', 'HIGH_VOLATILITY']).toContain(reg.regime);
  });

  it('runs a strategy on demand with custom parameters', async () => {
    const r = await ctx.app.inject({ method: 'POST', url: '/api/v1/strategies/rsi/run', payload: { symbol: 'DMHY1', parameters: { period: 7 } } });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.parameters.period).toBe(7);
  });

  it('screener filter builder with presets', async () => {
    const r = await ctx.app.inject({
      method: 'POST', url: '/api/v1/screener/run',
      payload: { filter: { op: 'AND', conditions: [{ left: { field: 'close' }, comparator: '>', right: { value: 0 } }] }, sort: 'volume', limit: 5 },
    });
    expect(r.json().data.items.length).toBe(5);
    const bad = await ctx.app.inject({ method: 'POST', url: '/api/v1/screener/run', payload: { filter: { op: 'AND', conditions: [{ left: { field: 'constructor' }, comparator: '>', right: { value: 1 } }] } } });
    expect(bad.statusCode).toBe(400);
    expect((await ctx.app.inject({ url: '/api/v1/screener/presets' })).json().data.length).toBeGreaterThan(0);
  });

  it('data quality report flags, never modifies', async () => {
    const r = (await ctx.app.inject({ url: '/api/v1/stocks/DMCB1/quality' })).json().data;
    expect(r.candles).toBeGreaterThan(700);
    expect(r.flags.filter((f: { code: string }) => f.code === 'INVALID_OHLC')).toHaveLength(0);
  });
});
