import { AppError, type MarketSummary, type OHLCV, type Quote, type Stock, type Timeframe, toDateKey } from '@nepse/shared';
import { z } from 'zod';
import { resample, type MarketDataProvider } from '../provider';
import { RateLimiter } from '../rate-limiter';

/**
 * HTTP adapter for a NEPSE market-data feed.
 *
 * NEPSE does not publish an official, documented public API. This adapter targets a
 * configurable endpoint (e.g. a licensed data vendor or a self-hosted gateway you operate)
 * exposing the JSON contract below. All responses are schema-validated; nothing is inferred.
 *
 *   GET {base}/securities                         -> Security[]
 *   GET {base}/quote/{symbol}                     -> QuoteDto
 *   GET {base}/history/{symbol}?from=&to=         -> CandleDto[]
 *   GET {base}/market-summary                     -> SummaryDto
 */
const SecurityDto = z.object({
  symbol: z.string(),
  companyName: z.string(),
  sector: z.string().nullable().optional(),
  subSector: z.string().nullable().optional(),
  listedDate: z.string().nullable().optional(),
  sharesOutstanding: z.number().nullable().optional(),
  paidUpCapital: z.number().nullable().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DELISTED']).default('ACTIVE'),
});
const CandleDto = z.object({ date: z.string(), open: z.number(), high: z.number(), low: z.number(), close: z.number(), volume: z.number(), turnover: z.number().nullable().optional() });
const QuoteDto = z.object({ symbol: z.string(), price: z.number(), previousClose: z.number().nullable(), volume: z.number(), turnover: z.number().nullable().optional(), timestamp: z.string() });
const SummaryDto = z.object({
  indexName: z.string().default('NEPSE'), indexValue: z.number().nullable(), change: z.number().nullable(), changePercent: z.number().nullable(),
  totalTurnover: z.number(), totalVolume: z.number(), advancers: z.number(), decliners: z.number(), unchanged: z.number(),
  high52w: z.number().default(0), low52w: z.number().default(0), asOf: z.string().nullable(),
});

export interface NepseProviderOptions {
  baseUrl: string;
  apiKey?: string;
  rateLimitPerMinute?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class NepseProvider implements MarketDataProvider {
  readonly name = 'nepse';
  readonly source = 'LIVE' as const;
  private readonly limiter: RateLimiter;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: NepseProviderOptions) {
    if (!opts.baseUrl) throw new AppError('PROVIDER_ERROR', 'NEPSE_API_BASE_URL is not configured');
    this.limiter = new RateLimiter(opts.rateLimitPerMinute ?? 30);
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    await this.limiter.acquire();
    const res = await this.fetchImpl(`${this.opts.baseUrl.replace(/\/$/, '')}${path}`, {
      headers: { Accept: 'application/json', ...(this.opts.apiKey ? { Authorization: `Bearer ${this.opts.apiKey}` } : {}) },
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? 15000),
    });
    if (!res.ok) throw new AppError('PROVIDER_ERROR', `NEPSE provider responded ${res.status} for ${path}`);
    const parsed = schema.safeParse(await res.json());
    if (!parsed.success) throw new AppError('PROVIDER_ERROR', `NEPSE provider returned an unexpected payload for ${path}`);
    return parsed.data;
  }

  async getSymbols(): Promise<Stock[]> {
    const list = await this.get('/securities', z.array(SecurityDto));
    return list.map((s) => ({ ...s, sector: s.sector ?? null, listedDate: s.listedDate ? new Date(s.listedDate) : null }));
  }

  async getQuote(symbol: string): Promise<Quote> {
    const q = await this.get(`/quote/${encodeURIComponent(symbol)}`, QuoteDto);
    const change = q.previousClose != null ? q.price - q.previousClose : null;
    return {
      symbol: q.symbol, price: q.price, previousClose: q.previousClose, change,
      changePercent: change != null && q.previousClose ? (change / q.previousClose) * 100 : null,
      volume: q.volume, turnover: q.turnover ?? null, timestamp: new Date(q.timestamp), source: this.source,
    };
  }

  async getHistoricalPrices(symbol: string, from: Date, to: Date, timeframe: Timeframe = '1D'): Promise<OHLCV[]> {
    const rows = await this.get(`/history/${encodeURIComponent(symbol)}?from=${toDateKey(from)}&to=${toDateKey(to)}`, z.array(CandleDto));
    const candles = rows.map((r) => ({ ...r, date: new Date(`${r.date.slice(0, 10)}T00:00:00Z`), turnover: r.turnover ?? undefined })).sort((a, b) => a.date.getTime() - b.date.getTime());
    return resample(candles, timeframe);
  }

  async getMarketSummary(): Promise<MarketSummary> {
    const s = await this.get('/market-summary', SummaryDto);
    return { ...s, asOf: s.asOf ? new Date(s.asOf) : null, source: this.source };
  }
}
