import { calculateFees, type FeeBreakdown, type FeeSchedule } from '@nepse/backtesting';
import type { PrismaClient } from '@nepse/database';
import { AppError, type SignalType } from '@nepse/shared';

export interface Account {
  id: string;
  cash: number;
  equity: number;
  currency: 'NPR';
  broker: string;
}

export interface Position {
  symbol: string;
  quantity: number;
  averageCost: number;
  marketPrice: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  realizedPnl: number;
}

export interface Order {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  type: 'MARKET';
  strategyId?: string;
  signal?: SignalType;
  reason?: string;
}

export interface OrderResult {
  orderId: string;
  status: 'FILLED' | 'REJECTED';
  filledPrice: number | null;
  fees: FeeBreakdown | null;
  realizedPnl: number | null;
  rejectReason?: string;
}

/** Broker abstraction. Only PaperBroker is implemented; live brokers are feature-flagged off. */
export interface BrokerAdapter {
  getAccount(): Promise<Account>;
  getPositions(): Promise<Position[]>;
  placeOrder(order: Order): Promise<OrderResult>;
  cancelOrder(orderId: string): Promise<void>;
}

export interface RiskLimits {
  maxPositionPct: number;
  maxExposurePct: number;
}

/**
 * Simulated broker backed by the database. Market orders fill at the latest close plus
 * configured slippage; fees come from the date-effective fee schedules.
 */
export class PaperBroker implements BrokerAdapter {
  constructor(
    private readonly db: PrismaClient,
    private readonly portfolioId: string,
    private readonly fees: FeeSchedule[],
    private readonly slippageBps: number,
    private readonly risk: RiskLimits,
  ) {}

  private async latestPrices(stockIds: string[]): Promise<Map<string, { close: number; date: Date }>> {
    if (!stockIds.length) return new Map();
    const rows = await this.db.$queryRaw<{ stock_id: string; close: number; date: Date }[]>`
      SELECT DISTINCT ON (stock_id) stock_id, close, date FROM daily_prices WHERE stock_id = ANY(${stockIds}) ORDER BY stock_id, date DESC`;
    return new Map(rows.map((r) => [r.stock_id, { close: r.close, date: r.date }]));
  }

  async getPositions(): Promise<Position[]> {
    const positions = await this.db.portfolioPosition.findMany({ where: { portfolioId: this.portfolioId }, include: { stock: true } });
    const px = await this.latestPrices(positions.map((p) => p.stockId));
    return positions.map((p) => {
      const mp = px.get(p.stockId)?.close ?? null;
      return {
        symbol: p.stock.symbol, quantity: p.quantity, averageCost: p.averageCost, marketPrice: mp,
        marketValue: mp !== null ? mp * p.quantity : null, unrealizedPnl: mp !== null ? (mp - p.averageCost) * p.quantity : null, realizedPnl: p.realizedPnl,
      };
    });
  }

  async getAccount(): Promise<Account> {
    const pf = await this.db.portfolio.findUniqueOrThrow({ where: { id: this.portfolioId } });
    const positions = await this.getPositions();
    return { id: pf.id, cash: pf.cash, equity: pf.cash + positions.reduce((a, p) => a + (p.marketValue ?? p.averageCost * p.quantity), 0), currency: 'NPR', broker: 'PAPER' };
  }

  async placeOrder(order: Order): Promise<OrderResult> {
    if (!Number.isInteger(order.quantity) || order.quantity <= 0) throw new AppError('VALIDATION_ERROR', 'Quantity must be a positive integer');
    const stock = await this.db.stock.findUnique({ where: { symbol: order.symbol.toUpperCase() } });
    if (!stock) throw new AppError('INVALID_SYMBOL', 'The requested stock symbol was not found.');
    if (stock.status !== 'ACTIVE') throw new AppError('VALIDATION_ERROR', `${stock.symbol} is ${stock.status.toLowerCase()} and cannot be traded`);
    const last = (await this.latestPrices([stock.id])).get(stock.id);
    if (!last) throw new AppError('INSUFFICIENT_DATA', 'No price available to fill against.');
    const slip = this.slippageBps / 10000;
    const price = Math.round(last.close * (order.side === 'BUY' ? 1 + slip : 1 - slip) * 100) / 100;
    const amount = price * order.quantity;
    const now = new Date();
    const nonTax = this.fees.filter((f) => f.type !== 'CAPITAL_GAINS_TAX');

    const reject = async (reason: string, code: 'INSUFFICIENT_FUNDS' | 'INSUFFICIENT_POSITION' | 'RISK_LIMIT'): Promise<never> => {
      await this.db.paperOrder.create({
        data: { portfolioId: this.portfolioId, stockId: stock.id, side: order.side, quantity: order.quantity, price, status: 'REJECTED', strategyId: order.strategyId, signal: order.signal, reason: `${order.reason ? `${order.reason} — ` : ''}REJECTED: ${reason}` },
      });
      throw new AppError(code, reason);
    };

    return this.db.$transaction(async (tx) => {
      const pf = await tx.portfolio.findUniqueOrThrow({ where: { id: this.portfolioId } });
      const pos = await tx.portfolioPosition.findUnique({ where: { portfolioId_stockId: { portfolioId: pf.id, stockId: stock.id } } });
      if (order.side === 'BUY') {
        const fees = calculateFees({ side: 'BUY', amount, date: now }, nonTax);
        if (amount + fees.total > pf.cash) return reject(`Insufficient cash: need NPR ${(amount + fees.total).toFixed(2)}, have NPR ${pf.cash.toFixed(2)}`, 'INSUFFICIENT_FUNDS');
        const account = await this.getAccount();
        const newPosValue = ((pos?.quantity ?? 0) + order.quantity) * last.close;
        if (account.equity > 0 && (newPosValue / account.equity) * 100 > this.risk.maxPositionPct)
          return reject(`Position would be ${((newPosValue / account.equity) * 100).toFixed(1)}% of equity, above max position size ${this.risk.maxPositionPct}%`, 'RISK_LIMIT');
        const exposure = account.equity - account.cash + amount;
        if (account.equity > 0 && (exposure / account.equity) * 100 > this.risk.maxExposurePct)
          return reject(`Portfolio exposure would be ${((exposure / account.equity) * 100).toFixed(1)}%, above max exposure ${this.risk.maxExposurePct}%`, 'RISK_LIMIT');
        const qty = (pos?.quantity ?? 0) + order.quantity;
        const avg = ((pos?.quantity ?? 0) * (pos?.averageCost ?? 0) + amount + fees.total) / qty;
        await tx.portfolioPosition.upsert({
          where: { portfolioId_stockId: { portfolioId: pf.id, stockId: stock.id } },
          create: { portfolioId: pf.id, stockId: stock.id, quantity: qty, averageCost: avg },
          update: { quantity: qty, averageCost: avg },
        });
        await tx.portfolio.update({ where: { id: pf.id }, data: { cash: pf.cash - amount - fees.total } });
        const o = await tx.paperOrder.create({
          data: { portfolioId: pf.id, stockId: stock.id, side: 'BUY', quantity: order.quantity, price, fees: fees.total, feeBreakdown: fees.lines as never, strategyId: order.strategyId, signal: order.signal, reason: order.reason },
        });
        return { orderId: o.id, status: 'FILLED' as const, filledPrice: price, fees, realizedPnl: null };
      }
      if (!pos || pos.quantity < order.quantity) return reject(`Insufficient position: holding ${pos?.quantity ?? 0} ${stock.symbol}`, 'INSUFFICIENT_POSITION');
      const sellFees = calculateFees({ side: 'SELL', amount, date: now }, nonTax);
      const preTax = amount - sellFees.total - pos.averageCost * order.quantity;
      const tax = calculateFees({ side: 'SELL', amount, date: now, realizedGain: preTax, entryDate: pos.openedAt }, this.fees.filter((f) => f.type === 'CAPITAL_GAINS_TAX'));
      const realized = preTax - tax.total;
      const fees: FeeBreakdown = { total: sellFees.total + tax.total, lines: [...sellFees.lines, ...tax.lines] };
      const remaining = pos.quantity - order.quantity;
      if (remaining === 0) await tx.portfolioPosition.delete({ where: { id: pos.id } });
      else await tx.portfolioPosition.update({ where: { id: pos.id }, data: { quantity: remaining, realizedPnl: pos.realizedPnl + realized } });
      await tx.portfolio.update({ where: { id: pf.id }, data: { cash: pf.cash + amount - fees.total } });
      const o = await tx.paperOrder.create({
        data: { portfolioId: pf.id, stockId: stock.id, side: 'SELL', quantity: order.quantity, price, fees: fees.total, feeBreakdown: fees.lines as never, strategyId: order.strategyId, signal: order.signal, reason: order.reason, realizedPnl: realized },
      });
      return { orderId: o.id, status: 'FILLED' as const, filledPrice: price, fees, realizedPnl: Math.round(realized * 100) / 100 };
    });
  }

  async cancelOrder(): Promise<void> {
    throw new AppError('VALIDATION_ERROR', 'Paper market orders fill immediately and cannot be cancelled.');
  }
}

/**
 * Placeholder for a future broker integration. Live trading is disabled unless
 * LIVE_TRADING_ENABLED=true AND a verified, legally appropriate broker API is implemented.
 */
export class LiveBrokerPlaceholder implements BrokerAdapter {
  constructor(private readonly enabled: boolean) {}
  private deny(): never {
    throw new AppError('FEATURE_DISABLED', this.enabled ? 'No verified NEPSE broker API adapter is configured.' : 'Live trading is disabled (LIVE_TRADING_ENABLED=false).');
  }
  async getAccount(): Promise<Account> { return this.deny(); }
  async getPositions(): Promise<Position[]> { return this.deny(); }
  async placeOrder(): Promise<OrderResult> { return this.deny(); }
  async cancelOrder(): Promise<void> { return this.deny(); }
}
