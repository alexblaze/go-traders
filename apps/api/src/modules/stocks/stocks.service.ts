import { findStockBySymbol, latestSnapshots, loadCandles, type PrismaClient } from '@nepse/database';
import { getIndicator, INDICATORS } from '@nepse/indicators';
import { checkDataQuality, resample } from '@nepse/market-data';
import { AppError, MarketCalendar, type MarketCalendarConfig, type Timeframe } from '@nepse/shared';
import type { AppDeps } from '../../lib/context';
import { finite } from '../../lib/http';
import { rangeStart, type Range } from '../../lib/ranges';

export interface StockListQuery {
  search?: string;
  sector?: string;
  page: number;
  pageSize: number;
  sort: 'symbol' | 'changePercent' | 'volume' | 'turnover' | 'close';
  order: 'asc' | 'desc';
}

export class StocksService {
  constructor(private readonly deps: AppDeps) {}
  private get db(): PrismaClient {
    return this.deps.db;
  }

  async list(q: StockListQuery) {
    const where = {
      ...(q.search ? { OR: [{ symbol: { contains: q.search.toUpperCase() } }, { company: { name: { contains: q.search, mode: 'insensitive' as const } } }] } : {}),
      ...(q.sector ? { company: { sector: { name: q.sector } } } : {}),
    };
    const stocks = await this.db.stock.findMany({ where, include: { company: { include: { sector: true } } } });
    const latest = await this.latestPrices(stocks.map((s) => s.id));
    const snaps = await latestSnapshots(this.db);
    const rows = stocks.map((s) => {
      const p = latest.get(s.id);
      const snap = snaps.get(s.id)?.values;
      return {
        symbol: s.symbol, companyName: s.company.name, sector: s.company.sector?.name ?? null, status: s.status, isDemo: s.isDemo, dataSource: s.dataSource,
        date: p?.date ?? null, close: p?.close ?? null, change: p?.change ?? null, changePercent: p?.changePercent ?? null, volume: p?.volume ?? null, turnover: p?.turnover ?? null,
        rsi14: snap?.rsi14 ?? null, regime: snap?.regime ?? null,
      };
    });
    const dir = q.order === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const av = a[q.sort] ?? (q.sort === 'symbol' ? '' : -Infinity);
      const bv = b[q.sort] ?? (q.sort === 'symbol' ? '' : -Infinity);
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    const start = (q.page - 1) * q.pageSize;
    return { items: rows.slice(start, start + q.pageSize), total: rows.length };
  }

  async latestPrices(stockIds: string[]) {
    if (!stockIds.length) return new Map();
    const rows = await this.db.$queryRaw<{ stock_id: string; date: Date; open: number; high: number; low: number; close: number; volume: number; turnover: number | null; change: number | null; change_percent: number | null; previous_close: number | null; source: string }[]>`
      SELECT DISTINCT ON (stock_id) stock_id, date, open, high, low, close, volume, turnover, change, change_percent, previous_close, source
      FROM daily_prices WHERE stock_id = ANY(${stockIds}) ORDER BY stock_id, date DESC`;
    return new Map(rows.map((r) => [r.stock_id, { date: r.date, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume, turnover: r.turnover, change: r.change, changePercent: r.change_percent, previousClose: r.previous_close, source: r.source }]));
  }

  async detail(symbol: string) {
    const s = await findStockBySymbol(this.db, symbol);
    const latest = (await this.latestPrices([s.id])).get(s.id);
    const yearAgo = latest ? new Date(latest.date.getTime() - 365 * 86400000) : undefined;
    const agg = latest ? await this.db.dailyPrice.aggregate({ where: { stockId: s.id, date: { gte: yearAgo } }, _max: { high: true }, _min: { low: true }, _avg: { volume: true } }) : null;
    const na = <T>(v: T | null | undefined) => (v === null || v === undefined ? 'N/A' : v);
    return {
      symbol: s.symbol,
      companyName: s.company.name,
      sector: s.company.sector?.name ?? 'N/A',
      subSector: na(s.company.subSector),
      listedDate: na(s.company.listedDate),
      sharesOutstanding: na(s.company.sharesOutstanding),
      paidUpCapital: na(s.company.paidUpCapital),
      status: s.status,
      isDemo: s.isDemo,
      dataSource: s.isDemo ? 'DEMO' : s.dataSource,
      quote: latest ? { ...latest } : null,
      high52w: agg?._max.high ?? null,
      low52w: agg?._min.low ?? null,
      avgVolume1y: agg?._avg.volume ?? null,
    };
  }

  async history(symbol: string, range: Range, timeframe: Timeframe, from?: Date, to?: Date) {
    const s = await findStockBySymbol(this.db, symbol);
    const lastRow = await this.db.dailyPrice.findFirst({ where: { stockId: s.id }, orderBy: { date: 'desc' } });
    if (!lastRow) return { symbol: s.symbol, timeframe, candles: [], dataSource: s.isDemo ? 'DEMO' : s.dataSource };
    const start = from ?? rangeStart(range, lastRow.date);
    const candles = await loadCandles(this.db, s.id, { from: start, to });
    return { symbol: s.symbol, timeframe, dataSource: s.isDemo ? 'DEMO' : s.dataSource, note: 'End-of-day data; 1D shows the latest session.', candles: resample(candles, timeframe) };
  }

  /** Indicator series for charting. Loads extra warm-up history so values at range start are valid. */
  async indicators(symbol: string, ids: string[], range: Range, params: Record<string, Record<string, number>>) {
    const s = await findStockBySymbol(this.db, symbol);
    const unknown = ids.filter((i) => !getIndicator(i));
    if (unknown.length) throw new AppError('VALIDATION_ERROR', `Unknown indicator(s): ${unknown.join(', ')}. Available: ${INDICATORS.map((i) => i.id).join(', ')}`);
    const lastRow = await this.db.dailyPrice.findFirst({ where: { stockId: s.id }, orderBy: { date: 'desc' } });
    if (!lastRow) return { symbol: s.symbol, dates: [], series: {} };
    const key = `ind:${s.symbol}:${lastRow.date.toISOString().slice(0, 10)}:${range}:${ids.sort().join(',')}:${JSON.stringify(params)}`;
    return this.deps.cache.wrap(key, 3600, async () => {
      const start = rangeStart(range, lastRow.date);
      const all = await loadCandles(this.db, s.id);
      const firstIdx = start ? all.findIndex((c) => c.date >= start) : 0;
      const series: Record<string, Record<string, (number | null)[]>> = {};
      for (const id of ids) {
        const out = getIndicator(id)!.calculate(all, params[id]);
        series[id] = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, finite(v.slice(firstIdx))]));
      }
      return { symbol: s.symbol, dates: all.slice(firstIdx).map((c) => c.date.toISOString().slice(0, 10)), series, definitions: ids.map((i) => ({ id: i, name: getIndicator(i)!.name, overlay: getIndicator(i)!.overlay, defaults: getIndicator(i)!.defaults })) };
    });
  }

  async quality(symbol: string) {
    const s = await findStockBySymbol(this.db, symbol);
    const candles = await loadCandles(this.db, s.id);
    const calSetting = await this.db.appSetting.findUnique({ where: { key: 'market.calendar' } });
    const holidays = await this.db.marketHoliday.findMany();
    const cfg = (calSetting?.value as unknown as MarketCalendarConfig | undefined) ?? undefined;
    const calendar = new MarketCalendar({
      tradingWeekdays: cfg?.tradingWeekdays ?? [7, 1, 2, 3, 4],
      holidays: [...(cfg?.holidays ?? []), ...holidays.filter((h) => !h.isSpecialSession).map((h) => h.date.toISOString().slice(0, 10))],
      specialSessions: holidays.filter((h) => h.isSpecialSession).map((h) => h.date.toISOString().slice(0, 10)),
    });
    return { symbol: s.symbol, ...checkDataQuality(candles, { calendar }), note: 'Suspicious data is flagged, never modified.' };
  }
}
