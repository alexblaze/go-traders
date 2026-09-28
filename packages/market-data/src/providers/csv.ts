import { AppError, type MarketSummary, type OHLCV, type Quote, type Stock, type Timeframe } from '@nepse/shared';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';
import { groupBySymbol, parsePriceCsv, type CsvPriceRow } from '../csv';
import { resample, summarize, type MarketDataProvider } from '../provider';

/**
 * Reads market data from CSV files so the platform works without any external feed.
 *
 * Directory layout:
 *   stocks.csv   symbol,companyName,sector[,subSector,listedDate,sharesOutstanding,paidUpCapital,status,isDemo]
 *   prices.csv   symbol,date,open,high,low,close,volume[,turnover]      (and/or prices/*.csv)
 */
export class CsvProvider implements MarketDataProvider {
  readonly name = 'csv';
  source: 'IMPORTED' | 'DEMO' = 'IMPORTED';
  private stocks: Stock[] = [];
  private prices = new Map<string, CsvPriceRow[]>();
  private loaded = false;

  constructor(private readonly dir: string) {}

  load(): void {
    if (this.loaded) return;
    const stocksFile = join(this.dir, 'stocks.csv');
    if (!existsSync(stocksFile)) throw new AppError('PROVIDER_ERROR', `CSV provider: ${stocksFile} not found`);
    const parsed = Papa.parse<Record<string, string>>(readFileSync(stocksFile, 'utf8').trim(), { header: true, skipEmptyLines: true });
    this.stocks = parsed.data.map((r) => ({
      symbol: r.symbol.trim().toUpperCase(),
      companyName: r.companyName?.trim() || r.symbol,
      sector: r.sector?.trim() || null,
      subSector: r.subSector?.trim() || null,
      listedDate: r.listedDate ? new Date(r.listedDate) : null,
      sharesOutstanding: r.sharesOutstanding ? Number(r.sharesOutstanding) : null,
      paidUpCapital: r.paidUpCapital ? Number(r.paidUpCapital) : null,
      status: (r.status?.trim().toUpperCase() as Stock['status']) || 'ACTIVE',
      isDemo: r.isDemo?.trim().toLowerCase() === 'true',
    }));
    if (this.stocks.length && this.stocks.every((s) => s.isDemo)) this.source = 'DEMO';

    const files: string[] = [];
    if (existsSync(join(this.dir, 'prices.csv'))) files.push(join(this.dir, 'prices.csv'));
    const sub = join(this.dir, 'prices');
    if (existsSync(sub)) files.push(...readdirSync(sub).filter((f) => f.endsWith('.csv')).map((f) => join(sub, f)));
    const known = new Set(this.stocks.map((s) => s.symbol));
    const all: CsvPriceRow[] = [];
    for (const f of files) all.push(...parsePriceCsv(readFileSync(f, 'utf8'), { knownSymbols: known }).rows);
    this.prices = groupBySymbol(all);
    this.loaded = true;
  }

  private series(symbol: string): CsvPriceRow[] {
    this.load();
    const s = this.prices.get(symbol.toUpperCase());
    if (!s) throw new AppError('INVALID_SYMBOL', `No CSV price data for ${symbol}`);
    return s;
  }

  async getSymbols(): Promise<Stock[]> {
    this.load();
    return this.stocks;
  }

  async getQuote(symbol: string): Promise<Quote> {
    const s = this.series(symbol);
    const lastC = s[s.length - 1];
    const prev = s[s.length - 2];
    return {
      symbol: symbol.toUpperCase(), price: lastC.close, previousClose: prev?.close ?? null,
      change: prev ? lastC.close - prev.close : null, changePercent: prev ? ((lastC.close - prev.close) / prev.close) * 100 : null,
      volume: lastC.volume, turnover: lastC.turnover ?? null, timestamp: lastC.date, source: this.source,
    };
  }

  async getHistoricalPrices(symbol: string, from: Date, to: Date, timeframe: Timeframe = '1D'): Promise<OHLCV[]> {
    const rows = this.series(symbol).filter((c) => c.date >= from && c.date <= to);
    return resample(rows.map(({ rowNumber: _r, symbol: _s, ...c }) => c as OHLCV), timeframe);
  }

  async getMarketSummary(): Promise<MarketSummary> {
    this.load();
    const latestDate = Math.max(...[...this.prices.values()].map((s) => s[s.length - 1].date.getTime()));
    const latest = [...this.prices.values()]
      .filter((s) => s[s.length - 1].date.getTime() === latestDate)
      .map((s) => ({ close: s[s.length - 1].close, prevClose: s[s.length - 2]?.close ?? null, volume: s[s.length - 1].volume, turnover: s[s.length - 1].turnover ?? null }));
    return summarize(latest, Number.isFinite(latestDate) ? new Date(latestDate) : null, this.source);
  }
}
