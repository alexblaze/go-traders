import { DISCLAIMER } from '@nepse/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { toCsv, toPdf, type ExportFormat, type PdfSection } from '../../lib/export';
import { IdParams, SymbolParams } from '../../lib/http';
import { loadBacktest } from '../backtests/backtests.routes';
import { PortfolioService } from '../portfolio/portfolio.service';
import { ScreenerService, ScreenSchema } from '../screener/screener.service';
import { SignalsService } from '../signals/signals.service';
import { watchlistView } from '../watchlists/watchlists.routes';

const FormatQuery = z.object({ format: z.enum(['csv', 'json', 'pdf']).default('csv') });
type Row = Record<string, unknown>;

async function send(reply: FastifyReply, name: string, format: ExportFormat, rows: Row[], json: unknown, pdf: PdfSection[], columns?: string[]) {
  const stamp = new Date().toISOString().slice(0, 10);
  const file = `${name}-${stamp}.${format}`;
  reply.header('Content-Disposition', `attachment; filename="${file}"`);
  if (format === 'json') return reply.type('application/json').send(JSON.stringify({ exportedAt: new Date().toISOString(), disclaimer: DISCLAIMER, data: json }, null, 2));
  if (format === 'csv') return reply.type('text/csv; charset=utf-8').send(toCsv(rows, columns));
  return reply.type('application/pdf').send(await toPdf(name, pdf, DISCLAIMER));
}

export default async function exportRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const tags = ['export'];
  const auth = { onRequest: [app.authenticate] };
  const security = [{ bearerAuth: [] }];
  const signals = new SignalsService(app.deps);

  r.get('/backtests/:id', { ...auth, schema: { tags, summary: 'Export a backtest', params: IdParams, querystring: FormatQuery, security } }, async (req, reply) => {
    const bt = await loadBacktest(app.deps.db, req.params.id, req.user.sub);
    const trades = bt.trades.map((t) => ({ entryDate: t.entryDate.toISOString().slice(0, 10), entryPrice: t.entryPrice, exitDate: t.exitDate.toISOString().slice(0, 10), exitPrice: t.exitPrice, quantity: t.quantity, grossPnl: t.grossPnl, fees: t.fees, netPnl: t.netPnl, returnPct: t.returnPct, holdingDays: t.holdingDays, exitReason: t.exitReason }));
    const m = (bt.metrics ?? {}) as Record<string, unknown>;
    return send(reply, `backtest-${bt.symbol}-${bt.strategyId}`, req.query.format, trades, bt, [
      { heading: `${bt.symbol} — ${bt.strategyName}`, lines: [`Period: ${bt.from?.toISOString().slice(0, 10)} → ${bt.to?.toISOString().slice(0, 10)}`, `Initial capital: NPR ${bt.initialCapital}`] },
      { heading: 'Metrics', lines: Object.entries(m).filter(([k]) => !['id', 'backtestId'].includes(k)).map(([k, v]) => `${k}: ${v}`) },
      { heading: 'Trades', table: { columns: ['entryDate', 'entryPrice', 'exitDate', 'exitPrice', 'quantity', 'netPnl', 'returnPct', 'exitReason'], rows: trades } },
      { heading: 'Warnings', lines: (bt.warnings as string[]).map((w) => `• ${w}`) },
    ]);
  });

  r.get('/signals', {
    schema: { tags, summary: 'Export latest signals across stocks', querystring: FormatQuery.extend({ strategy: z.string().max(64).default('ensemble'), signal: z.enum(['BUY', 'SELL', 'HOLD']).optional() }) },
  }, async (req, reply) => {
    const feed = await signals.feed({ strategyId: req.query.strategy, signal: req.query.signal, minStrength: 0, page: 1, pageSize: 5000 });
    const rows = feed.items.map((s) => ({ date: s.timestamp.toISOString().slice(0, 10), symbol: s.symbol, strategy: s.strategyId, signal: s.label, strength: s.strength, price: s.price, regime: s.marketRegime, reasons: s.reasons.map((x) => `${x.direction}: ${x.condition}`).join(' | ') }));
    return send(reply, `signals-${req.query.strategy}`, req.query.format, rows, feed.items, [{ heading: `Signals (${req.query.strategy})`, table: { columns: ['date', 'symbol', 'signal', 'strength', 'price', 'regime'], rows } }]);
  });

  r.get('/stocks/:symbol/signals', { schema: { tags, summary: 'Export signal history for a stock', params: SymbolParams, querystring: FormatQuery } }, async (req, reply) => {
    const h = await signals.history(req.params.symbol, undefined, 1, 5000);
    const rows = h.items.map((s) => ({ date: s.timestamp.toISOString().slice(0, 10), strategy: s.strategyId, signal: s.label, strength: s.strength, price: s.price, regime: s.marketRegime }));
    return send(reply, `signals-${req.params.symbol}`, req.query.format, rows, h.items, [{ heading: `${req.params.symbol} signal history`, table: { columns: ['date', 'strategy', 'signal', 'strength', 'price'], rows } }]);
  });

  r.get('/watchlists/:id', { ...auth, schema: { tags, summary: 'Export a watchlist', params: IdParams, querystring: FormatQuery, security } }, async (req, reply) => {
    const [w] = await watchlistView(app, req.user.sub, req.params.id);
    const rows = w.items.map(({ id: _id, ...i }) => i);
    return send(reply, `watchlist-${w.name}`, req.query.format, rows, w, [{ heading: `Watchlist: ${w.name}`, table: { columns: ['symbol', 'price', 'changePercent', 'volume', 'rsi14', 'trend', 'signal', 'signalStrength'], rows } }]);
  });

  r.get('/portfolio', { ...auth, schema: { tags, summary: 'Export paper portfolio', querystring: FormatQuery, security } }, async (req, reply) => {
    const p = await new PortfolioService(app.deps).summary(req.user.sub);
    const rows = p.positions as unknown as Row[];
    return send(reply, 'paper-portfolio', req.query.format, rows, p, [
      { heading: 'Paper portfolio', lines: [`Cash: ${p.cash}`, `Equity: ${p.equity}`, `Unrealized P&L: ${p.unrealizedPnl}`, `Realized P&L: ${p.realizedPnl}`, `Total return: ${p.totalReturnPct}%`] },
      { heading: 'Positions', table: { columns: ['symbol', 'quantity', 'averageCost', 'marketPrice', 'marketValue', 'unrealizedPnl'], rows } },
    ]);
  });

  r.post('/screener', { schema: { tags, summary: 'Export screener results', querystring: FormatQuery, body: ScreenSchema } }, async (req, reply) => {
    const res = await new ScreenerService(app.deps).run(req.body);
    const rows = res.items.map(({ matched: _m, ...i }) => i);
    return send(reply, 'market-scan', req.query.format, rows, res, [{ heading: 'Market scan', table: { columns: ['symbol', 'close', 'changePercent', 'volume', 'rsi14', 'adx14', 'signal', 'signalStrength'], rows } }]);
  });
}
