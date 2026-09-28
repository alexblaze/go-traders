/** Candle timeframe. NEPSE data is primarily end-of-day. */
export type Timeframe = '1D' | '1W' | '1M';

/** Where a piece of market data came from. Always surfaced to the user. */
export type DataSource = 'LIVE' | 'HISTORICAL' | 'MOCK' | 'IMPORTED' | 'DEMO';

export interface OHLCV {
  /** Candle timestamp (UTC). For daily candles this is the trading date at 00:00 UTC. */
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover?: number;
}

export interface Stock {
  symbol: string;
  companyName: string;
  sector: string | null;
  subSector?: string | null;
  listedDate?: Date | null;
  sharesOutstanding?: number | null;
  paidUpCapital?: number | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELISTED';
  isDemo?: boolean;
}

export interface Quote {
  symbol: string;
  price: number;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number;
  turnover: number | null;
  timestamp: Date;
  source: DataSource;
}

export interface MarketSummary {
  indexName: string;
  indexValue: number | null;
  change: number | null;
  changePercent: number | null;
  totalTurnover: number;
  totalVolume: number;
  advancers: number;
  decliners: number;
  unchanged: number;
  high52w: number;
  low52w: number;
  asOf: Date | null;
  source: DataSource;
}

export type SignalType = 'BUY' | 'SELL' | 'HOLD';
export type Direction = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface SignalReason {
  indicator: string;
  condition: string;
  value: number;
  threshold?: number;
  direction: Direction;
}

export type MarketRegime =
  | 'STRONG_UPTREND'
  | 'UPTREND'
  | 'SIDEWAYS'
  | 'DOWNTREND'
  | 'STRONG_DOWNTREND'
  | 'HIGH_VOLATILITY';

export interface TradingSignal {
  symbol: string;
  timestamp: Date;
  signal: SignalType;
  /**
   * Internal signal-strength metric in [0, 100].
   * This is NOT a probability of profit or of a price move.
   */
  strength: number;
  strategyId: string;
  price: number;
  reasons: SignalReason[];
  indicators: Record<string, number>;
  marketRegime?: MarketRegime;
  /** Optional structured extras (e.g. ensemble breakdown). */
  meta?: Record<string, unknown>;
}

export interface ParameterDefinition {
  key: string;
  label: string;
  default: number;
  min?: number;
  max?: number;
  step?: number;
  description?: string;
}

export interface StrategyContext {
  symbol: string;
  parameters?: Record<string, number>;
  marketRegime?: MarketRegime;
}

export type Role = 'USER' | 'ADMIN';

/** Label vocabulary used in UI — never "guaranteed", never "best stock". */
export const SIGNAL_LABELS: Record<SignalType, string> = {
  BUY: 'BUY candidate',
  SELL: 'SELL candidate',
  HOLD: 'HOLD / No clear signal',
};

export const DISCLAIMER =
  'This is a technical-analysis research output based on available data. It is not financial advice and does not guarantee future performance.';
