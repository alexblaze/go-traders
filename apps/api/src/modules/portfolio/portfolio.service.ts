import { loadFeeSchedules, findStockBySymbol, loadCandles, type PrismaClient } from '@nepse/database';
import { atr } from '@nepse/indicators';
import { AppError, last } from '@nepse/shared';
import type { AppDeps } from '../../lib/context';
import { parseSettings } from '../users/users.routes';
import { PaperBroker, type Order } from './broker';

export const DEFAULT_PORTFOLIO_CASH = 1_000_000;

export class PortfolioService {
  constructor(private readonly deps: AppDeps) {}
  private get db(): PrismaClient {
    return this.deps.db;
  }

  async getOrCreate(userId: string) {
    const existing = await this.db.portfolio.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
    if (existing) return existing;
    return this.db.portfolio.create({ data: { userId, name: 'Paper Portfolio', cash: DEFAULT_PORTFOLIO_CASH, initialCash: DEFAULT_PORTFOLIO_CASH } });
  }

  async broker(userId: string) {
    const pf = await this.getOrCreate(userId);
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    const settings = parseSettings(user.settings);
    return new PaperBroker(this.db, pf.id, await loadFeeSchedules(this.db), settings.slippageBps, settings.risk);
  }

  async summary(userId: string) {
    const pf = await this.getOrCreate(userId);
    const broker = await this.broker(userId);
    const positions = await broker.getPositions();
    const realizedAgg = await this.db.paperOrder.aggregate({ where: { portfolioId: pf.id, status: 'FILLED', side: 'SELL' }, _sum: { realizedPnl: true } });
    const invested = positions.reduce((a, p) => a + p.averageCost * p.quantity, 0);
    const marketValue = positions.reduce((a, p) => a + (p.marketValue ?? p.averageCost * p.quantity), 0);
    const equity = pf.cash + marketValue;
    const contributed = pf.initialCash + pf.netDeposits;
    const r2 = (v: number) => Math.round(v * 100) / 100;
    return {
      id: pf.id, name: pf.name, cash: r2(pf.cash), initialCash: pf.initialCash, netDeposits: pf.netDeposits,
      invested: r2(invested), marketValue: r2(marketValue), equity: r2(equity),
      unrealizedPnl: r2(marketValue - invested), realizedPnl: r2(realizedAgg._sum.realizedPnl ?? 0),
      totalReturnPct: contributed > 0 ? r2((equity / contributed - 1) * 100) : 0,
      exposurePct: equity > 0 ? r2((marketValue / equity) * 100) : 0,
      positions: positions.map((p) => ({ ...p, weightPct: equity > 0 && p.marketValue !== null ? r2((p.marketValue / equity) * 100) : null, unrealizedPnlPct: p.marketPrice !== null ? r2((p.marketPrice / p.averageCost - 1) * 100) : null })),
      broker: 'PAPER',
      note: 'Simulated portfolio. Fills use the latest available close plus configured slippage.',
    };
  }

  async order(userId: string, order: Order) {
    return (await this.broker(userId)).placeOrder(order);
  }

  async cash(userId: string, type: 'DEPOSIT' | 'WITHDRAWAL', amount: number, note?: string) {
    const pf = await this.getOrCreate(userId);
    if (type === 'WITHDRAWAL' && amount > pf.cash) throw new AppError('INSUFFICIENT_FUNDS', 'Cannot withdraw more than available cash.');
    const delta = type === 'DEPOSIT' ? amount : -amount;
    await this.db.$transaction([
      this.db.cashTransaction.create({ data: { portfolioId: pf.id, type, amount, note } }),
      this.db.portfolio.update({ where: { id: pf.id }, data: { cash: { increment: delta }, netDeposits: { increment: delta } } }),
    ]);
    return this.summary(userId);
  }

  async orders(userId: string, page: number, pageSize: number) {
    const pf = await this.getOrCreate(userId);
    const where = { portfolioId: pf.id };
    const [total, rows] = await Promise.all([
      this.db.paperOrder.count({ where }),
      this.db.paperOrder.findMany({ where, include: { stock: true }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { total, items: rows.map((o) => ({ id: o.id, symbol: o.stock.symbol, side: o.side, quantity: o.quantity, price: o.price, fees: o.fees, feeBreakdown: o.feeBreakdown, status: o.status, strategyId: o.strategyId, signal: o.signal, reason: o.reason, realizedPnl: o.realizedPnl, timestamp: o.createdAt })) };
  }

  /** Risk-analysis tools (stops, targets, R:R, position sizing). Analysis only — no guarantee of loss protection. */
  async risk(userId: string, symbol: string, riskPerTradePct = 1) {
    const stock = await findStockBySymbol(this.db, symbol);
    const candles = await loadCandles(this.db, stock.id, { limit: 100 });
    if (!candles.length) throw new AppError('INSUFFICIENT_DATA', 'No price history');
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    const r = parseSettings(user.settings).risk;
    const equity = (await this.summary(userId)).equity;
    const entry = candles[candles.length - 1].close;
    const atr14 = last(atr(candles, 14));
    const pctStop = entry * (1 - r.stopLossPct / 100);
    const atrStop = Number.isFinite(atr14) ? entry - atr14 * r.atrStopMultiple : null;
    const stop = atrStop !== null ? Math.max(pctStop, atrStop) : pctStop;
    const riskPerShare = entry - stop;
    const target = entry + riskPerShare * r.riskRewardRatio;
    const pctTarget = entry * (1 + r.takeProfitPct / 100);
    const riskBudget = (equity * riskPerTradePct) / 100;
    const sizeByRisk = riskPerShare > 0 ? Math.floor(riskBudget / riskPerShare) : 0;
    const sizeByCap = Math.floor((equity * r.maxPositionPct) / 100 / entry);
    const r2 = (v: number) => Math.round(v * 100) / 100;
    return {
      symbol: stock.symbol, entryReference: entry, atr14: Number.isFinite(atr14) ? r2(atr14) : null, settings: r,
      stops: { percentStop: r2(pctStop), atrStop: atrStop !== null ? r2(atrStop) : null, suggestedStop: r2(stop) },
      targets: { riskRewardTarget: r2(target), percentTarget: r2(pctTarget), riskRewardRatio: r.riskRewardRatio, percentTargetRR: riskPerShare > 0 ? r2((pctTarget - entry) / riskPerShare) : null },
      positionSizing: { equity: r2(equity), riskPerTradePct, riskBudget: r2(riskBudget), riskPerShare: r2(riskPerShare), sharesByRisk: sizeByRisk, sharesByMaxPosition: sizeByCap, suggestedShares: Math.max(0, Math.min(sizeByRisk, sizeByCap)) },
      disclaimer: 'Risk tools are analytical aids. Stops may not fill at the stop price (gaps, circuit limits, illiquidity) and do not guarantee protection against losses.',
    };
  }
}
