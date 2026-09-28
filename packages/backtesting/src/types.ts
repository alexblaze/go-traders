import type { SignalType } from '@nepse/shared';
import type { FeeLine, FeeSchedule } from './fees';

export interface BacktestConfig {
  symbol: string;
  initialCapital: number;
  /** Fraction of current equity allocated per entry (0–1]. */
  positionSize: number;
  /** Slippage in basis points applied against the trader on every fill. */
  slippageBps: number;
  feeSchedules: FeeSchedule[];
  /** 'nextOpen' (default, realistic): signal at close t, fill at open t+1. 'close': fill at close t (optimistic). */
  fillMode?: 'nextOpen' | 'close';
  /** Minimum tradable lot. */
  lotSize?: number;
  /** Liquidity constraint: max fraction of the fill bar's volume we may trade. */
  maxVolumeParticipation?: number;
  stopLossPct?: number | null;
  takeProfitPct?: number | null;
  /** ATR-multiple stop (uses ATR14 at entry). */
  atrStopMultiple?: number | null;
  /** Periods per year for Sharpe/Sortino annualisation. */
  periodsPerYear?: number;
  riskFreeRate?: number;
  strategyParameters?: Record<string, number>;
  /** Start evaluating signals from this date (earlier candles are warm-up only). */
  startDate?: Date;
  endDate?: Date;
}

export type ExitReason = 'SIGNAL' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'END_OF_DATA';

export interface BacktestTrade {
  entryDate: Date;
  entryPrice: number;
  exitDate: Date;
  exitPrice: number;
  quantity: number;
  grossPnl: number;
  fees: number;
  feeLines: FeeLine[];
  netPnl: number;
  returnPct: number;
  holdingDays: number;
  exitReason: ExitReason;
  entrySignalStrength: number;
}

export interface EquityPoint {
  date: Date;
  equity: number;
  cash: number;
  positionValue: number;
  drawdownPct: number;
}

export interface MonthlyReturn {
  month: string;
  returnPct: number;
}

export interface BacktestMetrics {
  totalReturnPct: number;
  cagrPct: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  winRatePct: number;
  profitFactor: number;
  numberOfTrades: number;
  averageTradePct: number;
  averageTradePnl: number;
  averageWinningTradePct: number;
  averageLosingTradePct: number;
  maxConsecutiveLosses: number;
  exposurePct: number;
  totalFees: number;
  finalEquity: number;
  buyAndHoldReturnPct: number;
}

export interface BacktestSignalEvent {
  date: Date;
  signal: SignalType;
  strength: number;
  price: number;
}

export interface BacktestResult {
  config: Omit<BacktestConfig, 'feeSchedules'> & { feeScheduleIds: string[] };
  strategyId: string;
  metrics: BacktestMetrics;
  trades: BacktestTrade[];
  equityCurve: EquityPoint[];
  monthlyReturns: MonthlyReturn[];
  signals: BacktestSignalEvent[];
  warnings: string[];
  period: { from: Date; to: Date; bars: number };
}
