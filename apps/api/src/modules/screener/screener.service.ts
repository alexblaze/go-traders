import { latestSnapshots, latestTradingDate, loadCandles } from '@nepse/database';
import { computeSnapshot, type IndicatorSnapshot } from '@nepse/indicators';
import { ConditionGroupSchema, DSL_FIELDS, evaluateGroup, groupUsesCross, type ConditionTrace } from '@nepse/strategies';
import { z } from 'zod';
import { ensureAnalysis } from '../../lib/analysis';
import type { AppDeps } from '../../lib/context';

export const ScreenSchema = z.object({
  filter: ConditionGroupSchema.optional(),
  sectors: z.array(z.string().max(100)).max(50).optional(),
  minPrice: z.number().min(0).optional(),
  maxPrice: z.number().min(0).optional(),
  minVolume: z.number().min(0).optional(),
  minTurnover: z.number().min(0).optional(),
  signal: z.enum(['BUY', 'SELL', 'HOLD']).optional(),
  minSignalStrength: z.number().min(0).max(100).optional(),
  signalStrategy: z.string().max(64).default('ensemble'),
  sort: z.enum([...DSL_FIELDS, 'signalStrength', 'symbol'] as [string, ...string[]]).default('turnover'),
  order: z.enum(['asc', 'desc']).default('desc'),
  limit: z.number().int().min(1).max(500).default(100),
});
export type Screen = z.infer<typeof ScreenSchema>;

export const PRESET_SCREENS: { name: string; description: string; screen: Partial<Screen> }[] = [
  {
    name: 'Oversold with volume, above EMA50',
    description: 'RSI < 30 AND Volume > 20D average AND Price > EMA50',
    screen: { filter: { op: 'AND', conditions: [
      { left: { field: 'rsi14' }, comparator: '<', right: { value: 30 } },
      { left: { field: 'volume' }, comparator: '>', right: { field: 'volumeSma20' } },
      { left: { field: 'close' }, comparator: '>', right: { field: 'ema50' } },
    ] } },
  },
  {
    name: 'Strong trend',
    description: 'ADX > 25 AND EMA20 > EMA50 AND MACD > Signal',
    screen: { filter: { op: 'AND', conditions: [
      { left: { field: 'adx14' }, comparator: '>', right: { value: 25 } },
      { left: { field: 'ema20' }, comparator: '>', right: { field: 'ema50' } },
      { left: { field: 'macd' }, comparator: '>', right: { field: 'macdSignal' } },
    ] } },
  },
  {
    name: 'Breakout candidates',
    description: 'Close > 20D resistance AND Volume > 1.5× 20D average',
    screen: { filter: { op: 'AND', conditions: [
      { left: { field: 'close' }, comparator: '>', right: { field: 'resistance20' } },
      { left: { field: 'volume' }, comparator: '>', right: { field: 'volumeSma20', multiplier: 1.5 } },
    ] } },
  },
  {
    name: 'Lower Bollinger band touch',
    description: 'Price < Lower Bollinger Band AND RSI < 35',
    screen: { filter: { op: 'AND', conditions: [
      { left: { field: 'close' }, comparator: '<', right: { field: 'bbLower' } },
      { left: { field: 'rsi14' }, comparator: '<', right: { value: 35 } },
    ] } },
  },
];

export class ScreenerService {
  constructor(private readonly deps: AppDeps) {}

  async run(screen: Screen) {
    const { db } = this.deps;
    await ensureAnalysis(this.deps);
    const date = await latestTradingDate(db);
    const snaps = await latestSnapshots(db);
    const stocks = await db.stock.findMany({
      where: { status: 'ACTIVE', ...(screen.sectors?.length ? { company: { sector: { name: { in: screen.sectors } } } } : {}) },
      include: { company: { include: { sector: true } } },
    });
    const sigs = date ? await db.signal.findMany({ where: { timestamp: date, strategyId: screen.signalStrategy } }) : [];
    const sigBy = new Map(sigs.map((s) => [s.stockId, s]));
    const useCross = screen.filter ? groupUsesCross(screen.filter) : false;
    const results = [];
    for (const s of stocks) {
      const snap = snaps.get(s.id);
      if (!snap || (date && snap.date.getTime() !== date.getTime())) continue;
      const v = snap.values as Record<string, number | null>;
      if (screen.minPrice !== undefined && (v.close ?? -1) < screen.minPrice) continue;
      if (screen.maxPrice !== undefined && (v.close ?? Infinity) > screen.maxPrice) continue;
      if (screen.minVolume !== undefined && (v.volume ?? -1) < screen.minVolume) continue;
      if (screen.minTurnover !== undefined && (v.turnover ?? -1) < screen.minTurnover) continue;
      const sig = sigBy.get(s.id);
      if (screen.signal && sig?.signal !== screen.signal) continue;
      if (screen.minSignalStrength !== undefined && (sig?.strength ?? -1) < screen.minSignalStrength) continue;
      let trace: ConditionTrace[] = [];
      if (screen.filter) {
        const toSnap = (x: Record<string, number | null>) => Object.fromEntries(Object.entries(x).map(([k, val]) => [k, val ?? NaN])) as unknown as IndicatorSnapshot;
        let cur = toSnap(v);
        let prev: IndicatorSnapshot | undefined;
        if (useCross) {
          const candles = await loadCandles(db, s.id, { limit: 400 });
          cur = computeSnapshot(candles);
          prev = computeSnapshot(candles.slice(0, -1));
        }
        trace = [];
        if (!evaluateGroup(screen.filter, cur, prev, trace)) continue;
      }
      results.push({
        symbol: s.symbol, companyName: s.company.name, sector: s.company.sector?.name ?? null, isDemo: s.isDemo,
        ...Object.fromEntries(DSL_FIELDS.map((f) => [f, v[f] ?? null])),
        regime: (snap.values as { regime?: string }).regime ?? null,
        signal: sig?.signal ?? null, signalStrength: sig?.strength ?? null, matched: trace.map((t) => t.description),
      } as Record<string, unknown> & { symbol: string });
    }
    const dir = screen.order === 'asc' ? 1 : -1;
    results.sort((a, b) => {
      const av = a[screen.sort] ?? null;
      const bv = b[screen.sort] ?? null;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av as number | string) < (bv as number | string) ? -dir : (av as number | string) > (bv as number | string) ? dir : 0;
    });
    return { asOf: date, total: results.length, items: results.slice(0, screen.limit), note: 'Screen results are factual filters on indicator values, not recommendations.' };
  }
}
