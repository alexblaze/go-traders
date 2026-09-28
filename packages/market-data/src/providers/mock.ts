import { AppError, type MarketSummary, type OHLCV, type Quote, type Stock, type Timeframe } from '@nepse/shared';
import { DEMO_UNIVERSE, demoStocks } from '../demo-universe';
import { resample, summarize, type MarketDataProvider } from '../provider';
import { defaultDemoRange, generateSyntheticCandles } from '../synthetic';

/** Generates realistic but SYNTHETIC data for development/testing. Source = MOCK. */
export class MockProvider implements MarketDataProvider {
  readonly name = 'mock';
  readonly source = 'MOCK' as const;
  private cache = new Map<string, OHLCV[]>();
  constructor(private readonly range = defaultDemoRange()) {}

  private series(symbol: string): OHLCV[] {
    const spec = DEMO_UNIVERSE.find((s) => s.symbol === symbol);
    if (!spec) throw new AppError('INVALID_SYMBOL', `Unknown symbol ${symbol}`);
    let s = this.cache.get(symbol);
    if (!s) {
      s = generateSyntheticCandles(spec, this.range);
      this.cache.set(symbol, s);
    }
    return s;
  }

  async getSymbols(): Promise<Stock[]> {
    return demoStocks();
  }

  async getQuote(symbol: string): Promise<Quote> {
    const s = this.series(symbol);
    const lastC = s[s.length - 1];
    const prev = s[s.length - 2];
    return {
      symbol, price: lastC.close, previousClose: prev?.close ?? null,
      change: prev ? lastC.close - prev.close : null, changePercent: prev ? ((lastC.close - prev.close) / prev.close) * 100 : null,
      volume: lastC.volume, turnover: lastC.turnover ?? null, timestamp: lastC.date, source: this.source,
    };
  }

  async getHistoricalPrices(symbol: string, from: Date, to: Date, timeframe: Timeframe = '1D'): Promise<OHLCV[]> {
    return resample(this.series(symbol).filter((c) => c.date >= from && c.date <= to), timeframe);
  }

  async getMarketSummary(): Promise<MarketSummary> {
    const latest = DEMO_UNIVERSE.map((d) => {
      const s = this.series(d.symbol);
      return { close: s[s.length - 1].close, prevClose: s[s.length - 2]?.close ?? null, volume: s[s.length - 1].volume, turnover: s[s.length - 1].turnover ?? null };
    });
    return summarize(latest, this.range.to, this.source);
  }
}
