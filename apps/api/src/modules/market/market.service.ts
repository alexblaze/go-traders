import { DERIVED_INDEX_NAME, latestSnapshots, latestTradingDate, type Prisma } from '@nepse/database';
import { mean, median } from '@nepse/shared';
import { detectRegime } from '@nepse/strategies';
import { ensureAnalysis } from '../../lib/analysis';
import type { AppDeps } from '../../lib/context';
import { rangeStart, type Range } from '../../lib/ranges';

export const TRENDING_CATEGORIES = ['most_active', 'highest_volume', 'highest_turnover', 'strongest_momentum', 'strongest_trend', 'top_gainers', 'top_losers', 'most_bullish_signals', 'most_bearish_signals'] as const;
export type TrendingCategory = (typeof TRENDING_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<TrendingCategory, string> = {
  most_active: 'Most active (turnover × trades proxy)',
  highest_volume: 'Highest volume',
  highest_turnover: 'Highest turnover',
  strongest_momentum: 'Highest momentum (ROC 12)',
  strongest_trend: 'Strongest trend (ADX with +DI dominant)',
  top_gainers: 'Largest price change (gainers)',
  top_losers: 'Largest price change (decliners)',
  most_bullish_signals: 'Strongest bullish signal consensus',
  most_bearish_signals: 'Strongest bearish signal consensus',
};

export class MarketService {
  constructor(private readonly deps: AppDeps) {}

  private async dataSources(): Promise<{ primary: string; sources: string[] }> {
    const rows = await this.deps.db.dailyPrice.groupBy({ by: ['source'], _count: true });
    const sources = rows.map((r) => r.source);
    const primary = sources.includes('IMPORTED') || sources.includes('LIVE') ? (sources.includes('LIVE') ? 'LIVE' : 'IMPORTED') : sources[0] ?? 'NONE';
    return { primary, sources };
  }

  async index(range: Range = '1Y') {
    const official = await this.deps.db.marketIndex.findFirst({ where: { name: 'NEPSE' }, orderBy: { date: 'desc' } });
    const name = official ? 'NEPSE' : DERIVED_INDEX_NAME;
    const latest = await this.deps.db.marketIndex.findFirst({ where: { name }, orderBy: { date: 'desc' } });
    if (!latest) return { name, isDerived: !official, points: [] };
    const from = rangeStart(range, latest.date);
    const points = await this.deps.db.marketIndex.findMany({ where: { name, ...(from ? { date: { gte: from } } : {}) }, orderBy: { date: 'asc' } });
    return {
      name,
      isDerived: !official,
      note: official ? 'Imported official index series.' : 'Derived equal-weight composite of stocks in the database — NOT the official NEPSE index.',
      points: points.map((p) => ({ date: p.date, value: p.value, change: p.change, changePercent: p.changePercent, volume: p.volume, turnover: p.turnover, advancers: p.advancers, decliners: p.decliners, unchanged: p.unchanged })),
    };
  }

  async summary() {
    const date = await latestTradingDate(this.deps.db);
    const ds = await this.dataSources();
    if (!date) return { asOf: null, dataSource: ds.primary, dataSources: ds.sources, index: null, totals: null };
    const key = `market:summary:${date.toISOString().slice(0, 10)}`;
    return this.deps.cache.wrap(key, 300, async () => {
      const [agg] = await this.deps.db.$queryRaw<{ adv: bigint; dec: bigint; unch: bigint; turnover: number | null; volume: number | null; n: bigint; hi: bigint; lo: bigint }[]>`
        WITH today AS (SELECT stock_id, close, change, volume, turnover FROM daily_prices WHERE date = ${date}::date),
             yr AS (SELECT stock_id, MAX(high) AS h, MIN(low) AS l FROM daily_prices WHERE date > ${date}::date - INTERVAL '365 days' GROUP BY stock_id)
        SELECT COUNT(*) FILTER (WHERE t.change > 0) AS adv,
               COUNT(*) FILTER (WHERE t.change < 0) AS dec,
               COUNT(*) FILTER (WHERE t.change = 0 OR t.change IS NULL) AS unch,
               SUM(t.turnover) AS turnover, SUM(t.volume) AS volume, COUNT(*) AS n,
               COUNT(*) FILTER (WHERE t.close >= yr.h * 0.999) AS hi,
               COUNT(*) FILTER (WHERE t.close <= yr.l * 1.001) AS lo
        FROM today t JOIN yr ON yr.stock_id = t.stock_id`;
      const idx = await this.index('1M');
      const lastPt = idx.points[idx.points.length - 1];
      const adv = Number(agg.adv);
      const dec = Number(agg.dec);
      return {
        asOf: date,
        dataSource: ds.primary,
        dataSources: ds.sources,
        index: lastPt ? { name: idx.name, isDerived: idx.isDerived, value: lastPt.value, change: lastPt.change, changePercent: lastPt.changePercent, note: idx.note } : null,
        totals: {
          turnover: Number(agg.turnover ?? 0), volume: Number(agg.volume ?? 0), stocksTraded: Number(agg.n),
          advancers: adv, decliners: dec, unchanged: Number(agg.unch), high52w: Number(agg.hi), low52w: Number(agg.lo),
          breadth: adv + dec > 0 ? Math.round((adv / (adv + dec)) * 1000) / 1000 : null,
          advanceDeclineRatio: dec > 0 ? Math.round((adv / dec) * 100) / 100 : null,
        },
      };
    });
  }

  async regime() {
    const idx = await this.index('3Y');
    const s = await this.summary();
    const candles = idx.points.map((p) => ({ date: new Date(p.date), open: p.value, high: p.value, low: p.value, close: p.value, volume: p.volume ?? 0 }));
    const breadth = s.totals?.breadth ?? undefined;
    const cfg = (await this.deps.db.appSetting.findUnique({ where: { key: 'market.regime' } }))?.value as Record<string, number> | undefined;
    const r = candles.length > 30 ? detectRegime(candles, cfg ?? {}, breadth ?? undefined) : { regime: 'SIDEWAYS' as const, evidence: [{ metric: 'history', value: candles.length, note: 'insufficient index history' }] };
    return { ...r, basedOn: idx.name, isDerived: idx.isDerived, methodology: 'Rule-based: EMA alignment, ADX trend strength, 20D annualised volatility, and market breadth. Configurable by admins.' };
  }

  async sectors(period: '1D' | '1W' | '1M' | '3M') {
    await ensureAnalysis(this.deps);
    const date = await latestTradingDate(this.deps.db);
    if (!date) return { asOf: null, sectors: [] };
    const days = { '1D': 0, '1W': 7, '1M': 31, '3M': 92 }[period];
    const rows = await this.deps.db.$queryRaw<{ sector: string | null; stock_id: string; close: number; change_percent: number | null; volume: number; turnover: number | null; base: number | null }[]>`
      SELECT sec.name AS sector, p.stock_id, p.close, p.change_percent, p.volume, p.turnover,
             (SELECT b.close FROM daily_prices b WHERE b.stock_id = p.stock_id AND b.date <= ${date}::date - ${days}::int ORDER BY b.date DESC LIMIT 1) AS base
      FROM daily_prices p
      JOIN stocks s ON s.id = p.stock_id
      JOIN companies c ON c.id = s.company_id
      LEFT JOIN sectors sec ON sec.id = c.sector_id
      WHERE p.date = ${date}::date`;
    const sig = await this.deps.db.signal.groupBy({ by: ['stockId', 'signal'], where: { timestamp: date, strategyId: { not: 'ensemble' } }, _count: true });
    const sigBy = new Map<string, { BUY: number; SELL: number }>();
    for (const g of sig) {
      const e = sigBy.get(g.stockId) ?? { BUY: 0, SELL: 0 };
      if (g.signal !== 'HOLD') e[g.signal] += g._count;
      sigBy.set(g.stockId, e);
    }
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = r.sector ?? 'Unclassified';
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    const round = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
    return {
      asOf: date,
      period,
      sectors: [...groups.entries()].map(([sector, list]) => {
        const rets = list.map((r) => (period === '1D' ? r.change_percent ?? NaN : r.base ? (r.close / r.base - 1) * 100 : NaN)).filter(Number.isFinite);
        return {
          sector,
          companies: list.length,
          averageReturnPct: round(mean(rets)),
          medianReturnPct: round(median(rets)),
          volume: list.reduce((a, r) => a + r.volume, 0),
          turnover: list.reduce((a, r) => a + (r.turnover ?? 0), 0),
          bullishSignals: list.reduce((a, r) => a + (sigBy.get(r.stock_id)?.BUY ?? 0), 0),
          bearishSignals: list.reduce((a, r) => a + (sigBy.get(r.stock_id)?.SELL ?? 0), 0),
        };
      }),
    };
  }

  async trending(category: TrendingCategory, limit: number, sector?: string) {
    await ensureAnalysis(this.deps);
    const date = await latestTradingDate(this.deps.db);
    if (!date) return { category, label: CATEGORY_LABELS[category], items: [] };
    const snaps = await latestSnapshots(this.deps.db);
    const stocks = await this.deps.db.stock.findMany({ where: sector ? { company: { sector: { name: sector } } } : {}, include: { company: { include: { sector: true } } } });
    const ens = await this.deps.db.signal.findMany({ where: { strategyId: 'ensemble', timestamp: date } });
    const ensBy = new Map(ens.map((e) => [e.stockId, e]));
    const items = stocks
      .map((s) => {
        const snap = snaps.get(s.id);
        if (!snap || snap.date.getTime() !== date.getTime()) return null;
        const v = snap.values;
        const e = ensBy.get(s.id);
        const meta = (e?.meta ?? {}) as Prisma.JsonObject;
        return {
          symbol: s.symbol, companyName: s.company.name, sector: s.company.sector?.name ?? null, isDemo: s.isDemo,
          close: v.close ?? null, changePercent: v.changePercent ?? null, volume: v.volume ?? null, turnover: v.turnover ?? null,
          rsi14: v.rsi14 ?? null, roc12: v.roc12 ?? null, adx14: v.adx14 ?? null, plusDI: v.plusDI ?? null, minusDI: v.minusDI ?? null, volumeRatio: v.volumeRatio ?? null,
          ensembleSignal: e?.signal ?? null, ensembleStrength: e?.strength ?? null,
          bullishStrategies: (meta.bullishStrategies as number) ?? 0, bearishStrategies: (meta.bearishStrategies as number) ?? 0,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const n = (v: number | null) => v ?? -Infinity;
    const sorters: Record<TrendingCategory, (a: (typeof items)[number], b: (typeof items)[number]) => number> = {
      most_active: (a, b) => n(b.turnover) - n(a.turnover),
      highest_volume: (a, b) => n(b.volume) - n(a.volume),
      highest_turnover: (a, b) => n(b.turnover) - n(a.turnover),
      strongest_momentum: (a, b) => n(b.roc12) - n(a.roc12),
      strongest_trend: (a, b) => n((b.plusDI ?? 0) > (b.minusDI ?? 0) ? b.adx14 : null) - n((a.plusDI ?? 0) > (a.minusDI ?? 0) ? a.adx14 : null),
      top_gainers: (a, b) => n(b.changePercent) - n(a.changePercent),
      top_losers: (a, b) => n(a.changePercent === null ? null : -a.changePercent) > n(b.changePercent === null ? null : -b.changePercent) ? -1 : 1,
      most_bullish_signals: (a, b) => b.bullishStrategies - a.bullishStrategies || n(b.ensembleSignal === 'BUY' ? b.ensembleStrength : 0) - n(a.ensembleSignal === 'BUY' ? a.ensembleStrength : 0),
      most_bearish_signals: (a, b) => b.bearishStrategies - a.bearishStrategies || n(b.ensembleSignal === 'SELL' ? b.ensembleStrength : 0) - n(a.ensembleSignal === 'SELL' ? a.ensembleStrength : 0),
    };
    items.sort(sorters[category]);
    return { category, label: CATEGORY_LABELS[category], asOf: date, items: items.slice(0, limit), note: 'Ranking by a factual metric; not a recommendation.' };
  }
}
