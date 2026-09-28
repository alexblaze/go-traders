import { mean, monthKey, stdev } from '@nepse/shared';
import type { BacktestMetrics, BacktestTrade, EquityPoint, MonthlyReturn } from './types';

const r2 = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);
const r4 = (v: number) => (Number.isFinite(v) ? Math.round(v * 10000) / 10000 : 0);

export function maxDrawdownPct(equity: number[]): number {
  let peak = -Infinity;
  let mdd = 0;
  for (const e of equity) {
    peak = Math.max(peak, e);
    if (peak > 0) mdd = Math.max(mdd, (peak - e) / peak);
  }
  return mdd * 100;
}

export function periodReturns(equity: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < equity.length; i++) out.push(equity[i - 1] > 0 ? equity[i] / equity[i - 1] - 1 : 0);
  return out;
}

export function sharpe(returns: number[], periodsPerYear: number, rf = 0): number {
  if (returns.length < 2) return 0;
  const ex = returns.map((r) => r - rf / periodsPerYear);
  const sd = stdev(ex);
  return sd === 0 ? 0 : (mean(ex) / sd) * Math.sqrt(periodsPerYear);
}

export function sortino(returns: number[], periodsPerYear: number, rf = 0): number {
  if (returns.length < 2) return 0;
  const ex = returns.map((r) => r - rf / periodsPerYear);
  const downside = Math.sqrt(ex.reduce((a, r) => a + Math.min(0, r) ** 2, 0) / ex.length);
  return downside === 0 ? 0 : (mean(ex) / downside) * Math.sqrt(periodsPerYear);
}

export function monthlyReturns(curve: EquityPoint[]): MonthlyReturn[] {
  const out: MonthlyReturn[] = [];
  let startEq = curve[0]?.equity;
  let current = curve[0] ? monthKey(curve[0].date) : '';
  let lastEq = startEq;
  for (const p of curve) {
    const m = monthKey(p.date);
    if (m !== current) {
      out.push({ month: current, returnPct: r2((lastEq / startEq - 1) * 100) });
      startEq = lastEq;
      current = m;
    }
    lastEq = p.equity;
  }
  if (curve.length) out.push({ month: current, returnPct: r2((lastEq / startEq - 1) * 100) });
  return out;
}

export function computeMetrics(
  curve: EquityPoint[],
  trades: BacktestTrade[],
  initialCapital: number,
  periodsPerYear: number,
  rf: number,
  barsInMarket: number,
  buyAndHoldReturnPct: number,
): BacktestMetrics {
  const equity = curve.map((p) => p.equity);
  const final = equity[equity.length - 1] ?? initialCapital;
  const rets = periodReturns(equity);
  const days = curve.length > 1 ? (curve[curve.length - 1].date.getTime() - curve[0].date.getTime()) / 86400000 : 0;
  const years = days / 365.25;
  const wins = trades.filter((t) => t.netPnl > 0);
  const losses = trades.filter((t) => t.netPnl <= 0);
  const grossWin = wins.reduce((a, t) => a + t.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.netPnl, 0));
  let streak = 0;
  let maxStreak = 0;
  for (const t of trades) {
    streak = t.netPnl <= 0 ? streak + 1 : 0;
    maxStreak = Math.max(maxStreak, streak);
  }
  return {
    totalReturnPct: r2((final / initialCapital - 1) * 100),
    cagrPct: r2(years > 0 && final > 0 ? ((final / initialCapital) ** (1 / years) - 1) * 100 : 0),
    maxDrawdownPct: r2(maxDrawdownPct(equity)),
    sharpeRatio: r4(sharpe(rets, periodsPerYear, rf)),
    sortinoRatio: r4(sortino(rets, periodsPerYear, rf)),
    winRatePct: r2(trades.length ? (wins.length / trades.length) * 100 : 0),
    profitFactor: r4(grossLoss === 0 ? (grossWin > 0 ? 999 : 0) : grossWin / grossLoss),
    numberOfTrades: trades.length,
    averageTradePct: r2(trades.length ? mean(trades.map((t) => t.returnPct)) : 0),
    averageTradePnl: r2(trades.length ? mean(trades.map((t) => t.netPnl)) : 0),
    averageWinningTradePct: r2(wins.length ? mean(wins.map((t) => t.returnPct)) : 0),
    averageLosingTradePct: r2(losses.length ? mean(losses.map((t) => t.returnPct)) : 0),
    maxConsecutiveLosses: maxStreak,
    exposurePct: r2(curve.length ? (barsInMarket / curve.length) * 100 : 0),
    totalFees: r2(trades.reduce((a, t) => a + t.fees, 0)),
    finalEquity: r2(final),
    buyAndHoldReturnPct: r2(buyAndHoldReturnPct),
  };
}
