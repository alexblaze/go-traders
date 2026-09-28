import type { DataSource, MarketSummary, OHLCV, Quote, Stock, Timeframe } from '@nepse/shared';

/**
 * Market-data provider abstraction. The application never talks to a data vendor directly,
 * so providers can be swapped (CSV, mock, a NEPSE feed, a paid vendor) via configuration.
 */
export interface MarketDataProvider {
  readonly name: string;
  readonly source: DataSource;
  getSymbols(): Promise<Stock[]>;
  getQuote(symbol: string): Promise<Quote>;
  getHistoricalPrices(symbol: string, from: Date, to: Date, timeframe: Timeframe): Promise<OHLCV[]>;
  getMarketSummary(): Promise<MarketSummary>;
}

/** Aggregate daily candles into weekly / monthly candles. */
export function resample(candles: OHLCV[], timeframe: Timeframe): OHLCV[] {
  if (timeframe === '1D') return candles;
  const keyOf = (d: Date) => {
    if (timeframe === '1M') return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    t.setUTCDate(t.getUTCDate() - t.getUTCDay());
    return t.toISOString().slice(0, 10);
  };
  const out: OHLCV[] = [];
  let curKey = '';
  for (const c of candles) {
    const k = keyOf(c.date);
    const lastC = out[out.length - 1];
    if (k !== curKey || !lastC) {
      out.push({ ...c });
      curKey = k;
    } else {
      lastC.high = Math.max(lastC.high, c.high);
      lastC.low = Math.min(lastC.low, c.low);
      lastC.close = c.close;
      lastC.volume += c.volume;
      lastC.turnover = (lastC.turnover ?? 0) + (c.turnover ?? 0);
    }
  }
  return out;
}

export function summarize(latest: { close: number; prevClose: number | null; volume: number; turnover: number | null; high52w?: number; low52w?: number }[], asOf: Date | null, source: DataSource): MarketSummary {
  let adv = 0, dec = 0, unch = 0, hi = 0, lo = 0, vol = 0, to = 0;
  for (const q of latest) {
    if (q.prevClose == null) unch++;
    else if (q.close > q.prevClose) adv++;
    else if (q.close < q.prevClose) dec++;
    else unch++;
    if (q.high52w !== undefined && q.close >= q.high52w) hi++;
    if (q.low52w !== undefined && q.close <= q.low52w) lo++;
    vol += q.volume;
    to += q.turnover ?? 0;
  }
  return {
    indexName: 'Equal-weight composite (derived)',
    indexValue: null, change: null, changePercent: null,
    totalTurnover: to, totalVolume: vol, advancers: adv, decliners: dec, unchanged: unch, high52w: hi, low52w: lo, asOf, source,
  };
}
