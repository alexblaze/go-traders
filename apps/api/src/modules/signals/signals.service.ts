import { analyzeSignalOutcomes } from '@nepse/backtesting';
import { findStockBySymbol, loadCandles, type Prisma } from '@nepse/database';
import { DISCLAIMER, SIGNAL_LABELS, type SignalType } from '@nepse/shared';
import { defaultRegistry, describeStrategy } from '@nepse/strategies';
import { ensureAnalysis } from '../../lib/analysis';
import type { AppDeps } from '../../lib/context';

const include = { components: { orderBy: { ordinal: 'asc' as const } }, stock: { include: { company: { include: { sector: true } } } }, strategy: true };

type SignalRow = Prisma.SignalGetPayload<{ include: typeof include }>;

export function presentSignal(s: SignalRow) {
  const def = defaultRegistry.get(s.strategyId);
  return {
    id: s.id,
    symbol: s.stock.symbol,
    companyName: s.stock.company.name,
    sector: s.stock.company.sector?.name ?? null,
    isDemo: s.stock.isDemo,
    strategyId: s.strategyId,
    strategyName: s.strategy.name,
    timeframe: '1D',
    timestamp: s.timestamp,
    generatedAt: s.generatedAt,
    signal: s.signal,
    label: SIGNAL_LABELS[s.signal],
    strength: s.strength,
    strengthNote: 'Internal signal-strength metric (0–100); not a probability of profit.',
    price: s.price,
    marketRegime: s.marketRegime,
    reasons: s.components.map((c) => ({ indicator: c.indicator, condition: c.condition, value: c.value, threshold: c.threshold, direction: c.direction })),
    indicatorSnapshot: s.indicatorSnapshot,
    parameters: s.parameters,
    meta: s.meta,
    indicatorsUsed: def?.indicatorsUsed ?? [],
    assumptions: def?.assumptions ?? [],
    limitations: def?.limitations ?? [],
  };
}

export class SignalsService {
  constructor(private readonly deps: AppDeps) {}

  /** Latest signals for all strategies on a stock (computed once per candle date, then read from DB). */
  async latestForStock(symbol: string) {
    await ensureAnalysis(this.deps);
    const stock = await findStockBySymbol(this.deps.db, symbol);
    const latest = await this.deps.db.signal.findFirst({ where: { stockId: stock.id }, orderBy: { timestamp: 'desc' }, select: { timestamp: true } });
    if (!latest) return { symbol: stock.symbol, date: null, overall: null, consensus: null, strategies: [], disclaimer: DISCLAIMER };
    const rows = await this.deps.db.signal.findMany({ where: { stockId: stock.id, timestamp: latest.timestamp }, include });
    const list = rows.map(presentSignal);
    const overall = list.find((s) => s.strategyId === 'ensemble') ?? null;
    const consensus = list.find((s) => s.strategyId === 'multi_indicator_consensus') ?? null;
    const order = defaultRegistry.list().map((s) => s.id);
    list.sort((a, b) => order.indexOf(a.strategyId) - order.indexOf(b.strategyId));
    const counts = { BUY: 0, SELL: 0, HOLD: 0 } as Record<SignalType, number>;
    list.filter((s) => s.strategyId !== 'ensemble').forEach((s) => counts[s.signal]++);
    return {
      symbol: stock.symbol,
      date: latest.timestamp,
      marketRegime: overall?.marketRegime ?? null,
      overall,
      consensus,
      agreement: { bullish: counts.BUY, neutral: counts.HOLD, bearish: counts.SELL, total: list.length - (overall ? 1 : 0) },
      strategies: list,
      dataSource: stock.isDemo ? 'DEMO' : stock.dataSource,
      disclaimer: DISCLAIMER,
    };
  }

  async history(symbol: string, strategyId: string | undefined, page: number, pageSize: number) {
    const stock = await findStockBySymbol(this.deps.db, symbol);
    const where = { stockId: stock.id, ...(strategyId ? { strategyId } : {}) };
    const [total, rows] = await Promise.all([
      this.deps.db.signal.count({ where }),
      this.deps.db.signal.findMany({ where, include, orderBy: [{ timestamp: 'desc' }, { strategyId: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { items: rows.map(presentSignal), total };
  }

  /** Cross-stock feed of signals on the latest date (dashboard bullish/bearish lists). */
  async feed(q: { signal?: SignalType; strategyId: string; minStrength: number; sector?: string; page: number; pageSize: number }) {
    await ensureAnalysis(this.deps);
    const latest = await this.deps.db.signal.findFirst({ where: { strategyId: q.strategyId }, orderBy: { timestamp: 'desc' }, select: { timestamp: true } });
    if (!latest) return { items: [], total: 0, date: null };
    const where: Prisma.SignalWhereInput = {
      strategyId: q.strategyId, timestamp: latest.timestamp, strength: { gte: q.minStrength },
      ...(q.signal ? { signal: q.signal } : {}),
      ...(q.sector ? { stock: { company: { sector: { name: q.sector } } } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.deps.db.signal.count({ where }),
      this.deps.db.signal.findMany({ where, include, orderBy: { strength: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);
    return { items: rows.map(presentSignal), total, date: latest.timestamp };
  }

  /** Historical outcome statistics per strategy for one stock (cached per candle date). */
  async stats(symbol: string) {
    const stock = await findStockBySymbol(this.deps.db, symbol);
    const candles = await loadCandles(this.deps.db, stock.id, { limit: 600 });
    const lastDate = candles[candles.length - 1]?.date.toISOString().slice(0, 10) ?? 'none';
    return this.deps.cache.wrap(`sigstats:${stock.symbol}:${lastDate}`, 12 * 3600, async () => ({
      symbol: stock.symbol,
      horizons: [5, 20],
      strategies: defaultRegistry
        .list()
        .filter((s) => s.id !== 'ensemble')
        .map((s) => {
          const r = analyzeSignalOutcomes(candles, s, stock.symbol, [5, 20]);
          const { outcomes: _o, ...summary } = r;
          return { ...summary, strategyName: s.name };
        }),
      label: 'Historical observations on this stock only; they do not imply future performance.',
    }));
  }

  describe() {
    return defaultRegistry.list().map(describeStrategy);
  }
}
