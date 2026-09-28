export type SignalType = 'BUY' | 'SELL' | 'HOLD';
export type Direction = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface StockRow {
  symbol: string; companyName: string; sector: string | null; status: string; isDemo: boolean; dataSource: string;
  date: string | null; close: number | null; change: number | null; changePercent: number | null; volume: number | null; turnover: number | null;
  rsi14: number | null; regime: string | null;
}

export interface StockDetail {
  symbol: string; companyName: string; sector: string; subSector: string | number; listedDate: string; sharesOutstanding: string | number;
  paidUpCapital: string | number; status: string; isDemo: boolean; dataSource: string;
  quote: { date: string; open: number; high: number; low: number; close: number; volume: number; turnover: number | null; change: number | null; changePercent: number | null; previousClose: number | null } | null;
  high52w: number | null; low52w: number | null; avgVolume1y: number | null;
}

export interface Candle { date: string; open: number; high: number; low: number; close: number; volume: number; turnover?: number }

export interface Reason { indicator: string; condition: string; value: number | null; threshold: number | null; direction: Direction }

export interface Signal {
  id: string; symbol: string; companyName: string; sector: string | null; isDemo: boolean; strategyId: string; strategyName: string; timeframe: string;
  timestamp: string; generatedAt: string; signal: SignalType; label: string; strength: number; strengthNote: string; price: number;
  marketRegime: string | null; reasons: Reason[]; indicatorSnapshot: Record<string, number | null>; parameters: Record<string, number> | null;
  meta: Record<string, unknown> | null; indicatorsUsed: string[]; assumptions: string[]; limitations: string[];
}

export interface StockSignals {
  symbol: string; date: string | null; marketRegime: string | null; overall: Signal | null; consensus: Signal | null;
  agreement: { bullish: number; neutral: number; bearish: number; total: number }; strategies: Signal[]; dataSource: string; disclaimer: string;
}

export interface MarketSummary {
  asOf: string | null; dataSource: string; dataSources: string[];
  index: { name: string; isDerived: boolean; value: number; change: number | null; changePercent: number | null; note?: string } | null;
  totals: { turnover: number; volume: number; stocksTraded: number; advancers: number; decliners: number; unchanged: number; high52w: number; low52w: number; breadth: number | null; advanceDeclineRatio: number | null } | null;
}

export interface IndexPoint { date: string; value: number; change: number | null; changePercent: number | null; volume: number | null; turnover: number | null; advancers: number | null; decliners: number | null; unchanged: number | null }

export interface SectorRow { sector: string; companies: number; averageReturnPct: number | null; medianReturnPct: number | null; volume: number; turnover: number; bullishSignals: number; bearishSignals: number }

export interface TrendingItem {
  symbol: string; companyName: string; sector: string | null; isDemo: boolean; close: number | null; changePercent: number | null; volume: number | null; turnover: number | null;
  rsi14: number | null; roc12: number | null; adx14: number | null; volumeRatio: number | null; ensembleSignal: SignalType | null; ensembleStrength: number | null; bullishStrategies: number; bearishStrategies: number;
}

export interface ParameterDef { key: string; label: string; default: number; min?: number; max?: number; step?: number; description?: string; value?: number }

export interface StrategyInfo {
  id: string; name: string; description: string; category: string; isBuiltin: boolean; isActive: boolean; parameters: ParameterDef[];
  indicatorsUsed?: string[]; assumptions?: string[]; limitations?: string[]; definition?: unknown; timeframe: string;
}

export interface BacktestMetrics {
  totalReturnPct: number; cagrPct: number; maxDrawdownPct: number; sharpeRatio: number; sortinoRatio: number; winRatePct: number; profitFactor: number;
  numberOfTrades: number; averageTradePct: number; averageTradePnl: number; averageWinningTradePct: number; averageLosingTradePct: number;
  maxConsecutiveLosses: number; exposurePct: number; totalFees: number; finalEquity: number; buyAndHoldReturnPct: number;
}

export interface BacktestTrade { id: string; entryDate: string; entryPrice: number; exitDate: string; exitPrice: number; quantity: number; grossPnl: number; fees: number; netPnl: number; returnPct: number; holdingDays: number; exitReason: string }

export interface Backtest {
  id: string; status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED'; progress: number; error: string | null; createdAt: string; completedAt: string | null;
  symbol: string; companyName: string; isDemo: boolean; strategyId: string; strategyName: string; config: Record<string, unknown>; parameters: Record<string, number> | null;
  from: string | null; to: string | null; initialCapital: number; metrics: BacktestMetrics | null; trades: BacktestTrade[];
  equityCurve: { date: string; equity: number; drawdownPct: number }[] | null; monthlyReturns: { month: string; returnPct: number }[] | null;
  signals: { date: string; signal: SignalType; strength: number; price: number }[] | null; walkForward: unknown; warnings: string[];
}

export interface Position { symbol: string; quantity: number; averageCost: number; marketPrice: number | null; marketValue: number | null; unrealizedPnl: number | null; unrealizedPnlPct: number | null; realizedPnl: number; weightPct: number | null }

export interface Portfolio {
  id: string; name: string; cash: number; initialCash: number; netDeposits: number; invested: number; marketValue: number; equity: number;
  unrealizedPnl: number; realizedPnl: number; totalReturnPct: number; exposurePct: number; positions: Position[]; note: string;
}

export interface PaperOrder { id: string; symbol: string; side: 'BUY' | 'SELL'; quantity: number; price: number; fees: number; status: string; strategyId: string | null; signal: SignalType | null; reason: string | null; realizedPnl: number | null; timestamp: string }

export interface WatchlistItem { id: string; symbol: string; companyName: string; isDemo: boolean; price: number | null; changePercent: number | null; volume: number | null; rsi14: number | null; trend: string | null; signal: SignalType | null; signalStrength: number | null }
export interface Watchlist { id: string; name: string; items: WatchlistItem[] }

export interface AlertRow { id: string; symbol: string; type: string; threshold: number | null; strategyId: string | null; channels: string[]; isActive: boolean; repeat: boolean; note: string | null; lastTriggeredAt: string | null; createdAt: string }
export interface NotificationRow { id: string; title: string; body: string; readAt: string | null; createdAt: string; channel: string }

export type Operand = { field: string; multiplier?: number } | { value: number };
export interface Comparison { left: Operand; comparator: string; right: Operand }
export interface ConditionGroup { op: 'AND' | 'OR'; conditions: (Comparison | ConditionGroup)[] }

export interface AiAnswer { answer: string; engine: 'claude' | 'template'; model?: string; note?: string; context: unknown }
