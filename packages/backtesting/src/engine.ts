import { atr } from '@nepse/indicators';
import { daysBetween, type OHLCV } from '@nepse/shared';
import type { TradingStrategy } from '@nepse/strategies';
import { calculateFees, type FeeLine, type FeeSchedule } from './fees';
import { computeMetrics, monthlyReturns } from './metrics';
import type { BacktestConfig, BacktestResult, BacktestSignalEvent, BacktestTrade, EquityPoint, ExitReason } from './types';
import { assertBacktestableCandles } from './validation';

interface OpenPosition {
  quantity: number;
  entryPrice: number;
  entryDate: Date;
  entryCost: number;
  entryFees: number;
  entryFeeLines: FeeLine[];
  stop: number | null;
  target: number | null;
  strength: number;
}

export const BACKTEST_WARNINGS = [
  'Historical performance does not guarantee future results.',
  'Results include modelled transaction costs and slippage; real costs may differ.',
  'Liquidity: fills assume trades at modelled prices; thinly traded NEPSE scrips may not fill at these levels.',
  'Missing or erroneous historical data can distort results.',
  'Survivorship bias: the tested universe may exclude delisted/merged companies.',
  'Look-ahead bias is mitigated by generating signals on bar close and filling on the next bar open.',
  'Parameter overfitting: parameters tuned on this period may not generalise — use walk-forward testing.',
  'Market regime changes can invalidate historical relationships.',
];

export function runBacktest(candles: OHLCV[], strategy: TradingStrategy, config: BacktestConfig): BacktestResult {
  assertBacktestableCandles(candles);
  const cfg = {
    fillMode: 'nextOpen' as const,
    lotSize: 1,
    maxVolumeParticipation: 0.1,
    periodsPerYear: 240,
    riskFreeRate: 0,
    stopLossPct: null,
    takeProfitPct: null,
    atrStopMultiple: null,
    ...config,
  };
  if (!(cfg.initialCapital > 0)) throw new RangeError('initialCapital must be positive');
  if (!(cfg.positionSize > 0 && cfg.positionSize <= 1)) throw new RangeError('positionSize must be in (0, 1]');

  const end = cfg.endDate ? candles.filter((c) => c.date.getTime() <= cfg.endDate!.getTime()) : candles;
  let startIdx = cfg.startDate ? end.findIndex((c) => c.date.getTime() >= cfg.startDate!.getTime()) : 0;
  if (startIdx < 0) startIdx = end.length;
  const warnings = [...BACKTEST_WARNINGS];
  const minBars = strategy.minCandles({ ...Object.fromEntries(strategy.parameters.map((p) => [p.key, p.default])), ...cfg.strategyParameters });
  if (startIdx < minBars - 1) {
    warnings.push(`First ${minBars - 1 - startIdx} evaluated bar(s) are within the strategy warm-up period and cannot produce signals.`);
  }
  const atrSeries = cfg.atrStopMultiple ? atr(end, 14) : [];

  let cash = cfg.initialCapital;
  let position: OpenPosition | null = null;
  let pending: { side: 'BUY' | 'SELL'; strength: number } | null = null;
  const trades: BacktestTrade[] = [];
  const curve: EquityPoint[] = [];
  const signals: BacktestSignalEvent[] = [];
  let peak = cfg.initialCapital;
  let barsInMarket = 0;
  let skipped = 0;
  const slip = cfg.slippageBps / 10000;
  const schedulesNoTax = cfg.feeSchedules.filter((s) => s.type !== 'CAPITAL_GAINS_TAX');
  const taxSchedules: FeeSchedule[] = cfg.feeSchedules.filter((s) => s.type === 'CAPITAL_GAINS_TAX');

  const enter = (i: number, rawPrice: number, strength: number) => {
    const bar = end[i];
    const fill = rawPrice * (1 + slip);
    const equity = cash;
    const budget = Math.min(cash, equity * cfg.positionSize);
    const estRate = budget > 0 ? calculateFees({ side: 'BUY', amount: budget, date: bar.date }, schedulesNoTax).total / budget : 0;
    let qty = Math.floor(budget / (fill * (1 + estRate)) / cfg.lotSize) * cfg.lotSize;
    const liq = Math.floor((bar.volume * cfg.maxVolumeParticipation) / cfg.lotSize) * cfg.lotSize;
    qty = Math.min(qty, liq);
    let fees = calculateFees({ side: 'BUY', amount: qty * fill, date: bar.date }, schedulesNoTax);
    while (qty > 0 && qty * fill + fees.total > cash) {
      qty -= cfg.lotSize;
      fees = calculateFees({ side: 'BUY', amount: qty * fill, date: bar.date }, schedulesNoTax);
    }
    if (qty <= 0) {
      skipped++;
      return;
    }
    const cost = qty * fill;
    cash -= cost + fees.total;
    const a = atrSeries[i - 1] ?? NaN;
    const stops = [
      cfg.stopLossPct ? fill * (1 - cfg.stopLossPct / 100) : null,
      cfg.atrStopMultiple && Number.isFinite(a) ? fill - a * cfg.atrStopMultiple : null,
    ].filter((x): x is number => x !== null);
    position = {
      quantity: qty, entryPrice: fill, entryDate: bar.date, entryCost: cost, entryFees: fees.total, entryFeeLines: fees.lines,
      stop: stops.length ? Math.max(...stops) : null,
      target: cfg.takeProfitPct ? fill * (1 + cfg.takeProfitPct / 100) : null,
      strength,
    };
  };

  const exit = (i: number, rawPrice: number, reason: ExitReason) => {
    const pos = position!;
    const bar = end[i];
    const fill = rawPrice * (1 - slip);
    const proceeds = pos.quantity * fill;
    const sellFees = calculateFees({ side: 'SELL', amount: proceeds, date: bar.date }, schedulesNoTax);
    const preTaxGain = proceeds - pos.entryCost - pos.entryFees - sellFees.total;
    const tax = calculateFees({ side: 'SELL', amount: proceeds, date: bar.date, realizedGain: preTaxGain, entryDate: pos.entryDate }, taxSchedules);
    const totalFees = pos.entryFees + sellFees.total + tax.total;
    const gross = proceeds - pos.entryCost;
    const net = gross - totalFees;
    cash += proceeds - sellFees.total - tax.total;
    trades.push({
      entryDate: pos.entryDate, entryPrice: round(pos.entryPrice), exitDate: bar.date, exitPrice: round(fill), quantity: pos.quantity,
      grossPnl: round(gross), fees: round(totalFees), feeLines: [...pos.entryFeeLines, ...sellFees.lines, ...tax.lines], netPnl: round(net),
      returnPct: round((net / (pos.entryCost + pos.entryFees)) * 100), holdingDays: daysBetween(pos.entryDate, bar.date), exitReason: reason,
      entrySignalStrength: pos.strength,
    });
    position = null;
  };

  for (let i = startIdx; i < end.length; i++) {
    const bar = end[i];
    // 1) Execute order generated on the previous bar's close at this bar's open.
    if (pending) {
      if (pending.side === 'BUY' && !position) enter(i, bar.open, pending.strength);
      else if (pending.side === 'SELL' && position) exit(i, bar.open, 'SIGNAL');
      pending = null;
    }
    // 2) Intrabar protective exits (stop assumed first when both touched — conservative).
    const pos = position as OpenPosition | null;
    if (pos) {
      if (pos.stop !== null && bar.low <= pos.stop) exit(i, Math.min(bar.open, pos.stop), 'STOP_LOSS');
      else if (pos.target !== null && bar.high >= pos.target) exit(i, Math.max(bar.open, pos.target), 'TAKE_PROFIT');
    }
    // 3) Generate signal using ONLY data up to and including this bar.
    const sig = strategy.generateSignal(end.slice(0, i + 1), { symbol: cfg.symbol, parameters: cfg.strategyParameters });
    if (sig.signal !== 'HOLD') {
      signals.push({ date: bar.date, signal: sig.signal, strength: sig.strength, price: bar.close });
      const actionable = (sig.signal === 'BUY' && !position) || (sig.signal === 'SELL' && position);
      if (actionable) {
        if (cfg.fillMode === 'close') {
          if (sig.signal === 'BUY') enter(i, bar.close, sig.strength);
          else exit(i, bar.close, 'SIGNAL');
        } else if (i < end.length - 1) {
          pending = { side: sig.signal, strength: sig.strength };
        }
      }
    }
    // 4) Mark to market at close.
    const p = position as OpenPosition | null;
    const posValue = p ? p.quantity * bar.close : 0;
    if (p) barsInMarket++;
    const equity = cash + posValue;
    peak = Math.max(peak, equity);
    curve.push({ date: bar.date, equity: round(equity), cash: round(cash), positionValue: round(posValue), drawdownPct: round(peak > 0 ? ((peak - equity) / peak) * 100 : 0) });
  }

  if (position && end.length) {
    exit(end.length - 1, end[end.length - 1].close, 'END_OF_DATA');
    const lastPt = curve[curve.length - 1];
    lastPt.equity = round(cash);
    lastPt.cash = round(cash);
    lastPt.positionValue = 0;
    warnings.push('An open position was closed at the final bar close (END_OF_DATA) to realise P&L.');
  }
  if (skipped) warnings.push(`${skipped} entry signal(s) were skipped due to insufficient cash or the liquidity (volume participation) limit.`);
  if (trades.length < 30) warnings.push(`Small sample: only ${trades.length} trade(s). Statistics are not reliable.`);

  const firstEval = end[startIdx];
  const lastBar = end[end.length - 1];
  const bh = firstEval && lastBar ? (lastBar.close / firstEval.close - 1) * 100 : 0;
  const { feeSchedules, ...rest } = cfg;
  return {
    config: { ...rest, feeScheduleIds: feeSchedules.map((f) => f.id) },
    strategyId: strategy.id,
    metrics: computeMetrics(curve, trades, cfg.initialCapital, cfg.periodsPerYear, cfg.riskFreeRate, barsInMarket, bh),
    trades,
    equityCurve: curve,
    monthlyReturns: monthlyReturns(curve),
    signals,
    warnings,
    period: { from: firstEval?.date ?? new Date(0), to: lastBar?.date ?? new Date(0), bars: curve.length },
  };
}

function round(v: number, d = 4): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
