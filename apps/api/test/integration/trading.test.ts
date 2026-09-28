import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, loginAdmin, registerUser, type TestCtx } from './helpers';

let ctx: TestCtx;
let token: string;
beforeAll(async () => {
  ctx = await createTestApp();
  token = (await registerUser(ctx.app, 'trader')).token;
});
afterAll(async () => ctx.close());

describe('backtests', () => {
  it('runs a backtest and returns metrics, curves, trades and warnings', async () => {
    const r = await ctx.app.inject({
      method: 'POST', url: '/api/v1/backtests?mode=sync', headers: bearer(token),
      payload: { symbol: 'DMHY1', strategyId: 'ema_crossover', initialCapital: 500000, slippageBps: 10, positionSize: 1, parameters: { fast: 10, slow: 30 } },
    });
    expect(r.statusCode).toBe(201);
    const bt = r.json().data;
    expect(bt.status).toBe('COMPLETED');
    expect(bt.metrics).toMatchObject({ numberOfTrades: bt.trades.length });
    expect(bt.equityCurve.length).toBeGreaterThan(500);
    expect(bt.equityCurve[0]).toHaveProperty('drawdownPct');
    expect(bt.trades[0].fees).toBeGreaterThan(0); // DB fee schedules applied
    expect(bt.warnings.join(' ')).toMatch(/survivorship/i);
    const list = (await ctx.app.inject({ url: '/api/v1/backtests', headers: bearer(token) })).json();
    expect(list.data[0].id).toBe(bt.id);
    const csv = await ctx.app.inject({ url: `/api/v1/export/backtests/${bt.id}?format=csv`, headers: bearer(token) });
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.body.split('\n')[0]).toMatch(/^entryDate,entryPrice/);
    const pdf = await ctx.app.inject({ url: `/api/v1/export/backtests/${bt.id}?format=pdf`, headers: bearer(token) });
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('queues async backtests on BullMQ', async () => {
    const r = await ctx.app.inject({ method: 'POST', url: '/api/v1/backtests', headers: bearer(token), payload: { symbol: 'DMCB1', strategyId: 'macd' } });
    expect(r.statusCode).toBe(202);
    const job = await ctx.queues.backtesting.getJob(r.json().data ? (await ctx.queues.backtesting.getJobs(['waiting']))[0].id! : '');
    expect(job?.data.backtestId).toBe(r.json().data.id);
  });

  it('users cannot see each other\'s backtests', async () => {
    const other = await registerUser(ctx.app, 'other');
    const mine = (await ctx.app.inject({ url: '/api/v1/backtests', headers: bearer(token) })).json().data[0];
    expect((await ctx.app.inject({ url: `/api/v1/backtests/${mine.id}`, headers: bearer(other.token) })).statusCode).toBe(404);
  });
});

describe('paper trading', () => {
  it('buys and sells with fees and tracks P&L', async () => {
    const pf0 = (await ctx.app.inject({ url: '/api/v1/portfolio', headers: bearer(token) })).json().data;
    expect(pf0.cash).toBe(1_000_000);
    const buy = await ctx.app.inject({ method: 'POST', url: '/api/v1/portfolio/orders', headers: bearer(token), payload: { symbol: 'DMCB2', side: 'BUY', quantity: 100, strategyId: 'ensemble', signal: 'BUY', reason: 'test' } });
    expect(buy.statusCode).toBe(201);
    const b = buy.json().data;
    expect(b.status).toBe('FILLED');
    expect(b.fees.total).toBeGreaterThan(0);
    expect(b.portfolio.positions[0]).toMatchObject({ symbol: 'DMCB2', quantity: 100 });
    expect(b.portfolio.cash).toBeCloseTo(1_000_000 - 100 * b.filledPrice - b.fees.total, 1);
    const sell = (await ctx.app.inject({ method: 'POST', url: '/api/v1/portfolio/orders', headers: bearer(token), payload: { symbol: 'DMCB2', side: 'SELL', quantity: 100 } })).json().data;
    expect(sell.realizedPnl).toBeLessThan(0); // round trip at same price costs fees + slippage
    expect(sell.portfolio.positions).toHaveLength(0);
    const orders = (await ctx.app.inject({ url: '/api/v1/portfolio/orders', headers: bearer(token) })).json();
    expect(orders.data.map((o: { side: string }) => o.side)).toEqual(['SELL', 'BUY']);
  });

  it('rejects overselling, overspending and risk-limit breaches', async () => {
    const sell = await ctx.app.inject({ method: 'POST', url: '/api/v1/portfolio/orders', headers: bearer(token), payload: { symbol: 'DMCB2', side: 'SELL', quantity: 1 } });
    expect(sell.json().error.code).toBe('INSUFFICIENT_POSITION');
    const big = await ctx.app.inject({ method: 'POST', url: '/api/v1/portfolio/orders', headers: bearer(token), payload: { symbol: 'DMCB2', side: 'BUY', quantity: 1_000_000 } });
    expect(big.json().error.code).toBe('INSUFFICIENT_FUNDS');
    const risky = await ctx.app.inject({ method: 'POST', url: '/api/v1/portfolio/orders', headers: bearer(token), payload: { symbol: 'DMCB2', side: 'BUY', quantity: 1500 } });
    expect(risky.json().error.code).toBe('RISK_LIMIT');
  });

  it('cash deposit/withdrawal and live trading gate', async () => {
    const pf = (await ctx.app.inject({ method: 'POST', url: '/api/v1/portfolio/cash', headers: bearer(token), payload: { type: 'DEPOSIT', amount: 5000 } })).json().data;
    expect(pf.netDeposits).toBe(5000);
    const live = await ctx.app.inject({ method: 'POST', url: '/api/v1/portfolio/orders', headers: bearer(token), payload: { symbol: 'DMCB2', side: 'BUY', quantity: 1, broker: 'LIVE' } });
    expect(live.json().error.code).toBe('FEATURE_DISABLED');
  });

  it('risk tools compute stops and sizing', async () => {
    const r = (await ctx.app.inject({ url: '/api/v1/portfolio/risk/DMCB1', headers: bearer(token) })).json().data;
    expect(r.stops.suggestedStop).toBeLessThan(r.entryReference);
    expect(r.targets.riskRewardTarget).toBeGreaterThan(r.entryReference);
    expect(r.disclaimer).toMatch(/do not guarantee/);
  });
});

describe('watchlists, alerts, notifications', () => {
  it('creates a watchlist with signal columns', async () => {
    const w = await ctx.app.inject({ method: 'POST', url: '/api/v1/watchlists', headers: bearer(token), payload: { name: 'Banking', symbols: ['DMCB1', 'DMCB2'] } });
    expect(w.statusCode).toBe(201);
    const items = w.json().data.items;
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveProperty('rsi14');
    expect(items[0]).toHaveProperty('signalStrength');
    const exp = await ctx.app.inject({ url: `/api/v1/export/watchlists/${w.json().data.id}?format=json`, headers: bearer(token) });
    expect(exp.json().disclaimer).toBeTruthy();
  });

  it('validates alert thresholds and creates alerts', async () => {
    const bad = await ctx.app.inject({ method: 'POST', url: '/api/v1/alerts', headers: bearer(token), payload: { symbol: 'DMCB1', type: 'RSI_BELOW' } });
    expect(bad.statusCode).toBe(400);
    const ok = await ctx.app.inject({ method: 'POST', url: '/api/v1/alerts', headers: bearer(token), payload: { symbol: 'DMCB1', type: 'PRICE_ABOVE', threshold: 1 } });
    expect(ok.statusCode).toBe(201);
    expect((await ctx.app.inject({ url: '/api/v1/notifications', headers: bearer(token) })).json().meta.unread).toBe(0);
  });
});

describe('admin CSV import', () => {
  it('previews with validation errors, then commits idempotently', async () => {
    const admin = await loginAdmin(ctx.app);
    const csv = [
      'symbol,date,open,high,low,close,volume,turnover',
      'NEWCO,2026-09-21,100,105,99,104,1000,104000',
      'NEWCO,2026-09-22,104,110,103,109,2000,218000',
      'NEWCO,2026-09-22,104,110,103,109,2000,218000',
      'NEWCO,bad-date,1,1,1,1,1,1',
    ].join('\n');
    const noCreate = (await ctx.app.inject({ method: 'POST', url: '/api/v1/admin/imports', headers: bearer(admin), payload: { filename: 'x.csv', csv } })).json().data;
    expect(noCreate.validRows).toBe(0); // unknown symbol rejected
    const prev = (await ctx.app.inject({ method: 'POST', url: '/api/v1/admin/imports', headers: bearer(admin), payload: { filename: 'x.csv', csv, createStocks: true } })).json().data;
    expect(prev.validRows).toBe(2);
    expect(prev.errors.map((e: { code: string }) => e.code).sort()).toEqual(['DUPLICATE_ROW', 'INVALID_DATE']);
    expect(prev.newSymbols).toEqual(['NEWCO']);
    const commit = await ctx.app.inject({ method: 'POST', url: `/api/v1/admin/imports/${prev.id}/commit`, headers: bearer(admin) });
    expect(commit.json().data).toMatchObject({ status: 'COMPLETED', inserted: 2, updated: 0 });
    const again = (await ctx.app.inject({ method: 'POST', url: '/api/v1/admin/imports', headers: bearer(admin), payload: { filename: 'x.csv', csv, createStocks: true } })).json().data;
    expect(again.warnings.filter((w: { code: string }) => w.code === 'EXISTING_RECORD')).toHaveLength(2);
    const c2 = (await ctx.app.inject({ method: 'POST', url: `/api/v1/admin/imports/${again.id}/commit`, headers: bearer(admin) })).json().data;
    expect(c2).toMatchObject({ inserted: 0, updated: 2 });
    const hist = (await ctx.app.inject({ url: '/api/v1/stocks/NEWCO/history?range=MAX' })).json().data;
    expect(hist.candles).toHaveLength(2);
    expect(hist.dataSource).toBe('IMPORTED');
  });

  it('admin can manage strategy parameters and fee schedules', async () => {
    const admin = await loginAdmin(ctx.app);
    const bad = await ctx.app.inject({ method: 'PUT', url: '/api/v1/admin/strategies/rsi/parameters', headers: bearer(admin), payload: { nope: 1 } });
    expect(bad.statusCode).toBe(400);
    const ok = await ctx.app.inject({ method: 'PUT', url: '/api/v1/admin/strategies/rsi/parameters', headers: bearer(admin), payload: { oversold: 25 } });
    expect(ok.json().data[0]).toMatchObject({ key: 'oversold', value: 25 });
    const fees = (await ctx.app.inject({ url: '/api/v1/admin/fees' })).json().data;
    expect(fees.every((f: { isVerified: boolean }) => f.isVerified === false)).toBe(true);
  });
});

describe('AI analyst', () => {
  it('answers from structured data with the required sections', async () => {
    const r = await ctx.app.inject({ method: 'POST', url: '/api/v1/ai/ask', headers: bearer(token), payload: { symbol: 'DMCB1', question: 'What changed compared with yesterday?' } });
    const d = r.json().data;
    expect(d.engine).toBe('template');
    for (const h of ['## Summary', '## Observed Data', '## Strategy Signals', '## Risk Factors', '## Uncertainty', '## Data Timestamp', '## What changed']) expect(d.answer).toContain(h);
    expect(d.answer).toMatch(/SYNTHETIC DEMO/);
    expect(d.answer).toMatch(/does not guarantee future performance/);
    expect(d.context.observed.close).toBeGreaterThan(0);
  });
});
