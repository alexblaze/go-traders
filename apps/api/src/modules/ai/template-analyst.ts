import type { BacktestContext, StockContext } from './context';

/**
 * Deterministic, rule-based analyst used when no LLM is configured (and as a fallback).
 * Every statement is derived directly from the structured context.
 */
const f = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? 'N/A' : v.toLocaleString('en-US', { maximumFractionDigits: d }));

function trendLabel(c: StockContext): string {
  const { close } = c.observed;
  const { ema20, ema50 } = c.indicators;
  if (close === null || ema50 === null) return 'Undetermined (insufficient history)';
  if (close > ema50 && (ema20 ?? 0) > ema50) return 'Bullish (price and EMA20 above EMA50)';
  if (close < ema50 && (ema20 ?? Infinity) < ema50) return 'Bearish (price and EMA20 below EMA50)';
  return 'Mixed';
}

function momentumLabel(rsi: number | null): string {
  if (rsi === null) return 'N/A';
  if (rsi >= 70) return `Overbought zone (RSI ${f(rsi, 1)})`;
  if (rsi >= 60) return `Moderately bullish (RSI ${f(rsi, 1)})`;
  if (rsi > 40) return `Neutral (RSI ${f(rsi, 1)})`;
  if (rsi > 30) return `Moderately bearish (RSI ${f(rsi, 1)})`;
  return `Oversold zone (RSI ${f(rsi, 1)})`;
}

function risks(c: StockContext): string[] {
  const out: string[] = [];
  const { close } = c.observed;
  const { rsi14, hv20, adx14 } = c.indicators;
  if (close !== null && c.levels.resistance20 !== null && close < c.levels.resistance20 && (c.levels.resistance20 - close) / close < 0.02) out.push(`Price is within 2% of 20-day resistance (${f(c.levels.resistance20)}).`);
  if (close !== null && c.levels.support20 !== null && close > c.levels.support20 && (close - c.levels.support20) / close < 0.02) out.push(`Price is within 2% of 20-day support (${f(c.levels.support20)}).`);
  if (rsi14 !== null && rsi14 >= 70) out.push('Momentum may be extended (RSI ≥ 70).');
  if (rsi14 !== null && rsi14 <= 30) out.push('Selling pressure is strong (RSI ≤ 30); oversold can persist.');
  if (hv20 !== null && hv20 >= 40) out.push(`Volatility is elevated (20D annualised HV ${f(hv20, 1)}%).`);
  if (adx14 !== null && adx14 < 20) out.push('Trend strength is weak (ADX < 20): trend-following signals are less reliable.');
  if ((c.observed.volumeRatio ?? 1) < 0.7) out.push('Volume is below its 20-day average (weaker confirmation).');
  if (c.isDemo) out.push('This analysis uses SYNTHETIC DEMO data, not real market prices.');
  if (!out.length) out.push('No specific technical risk flags from the configured checks; general market risk always applies.');
  return out;
}

export function templateStockAnswer(c: StockContext, question: string): string {
  const q = question.toLowerCase();
  const ens = c.ensemble;
  const sig = ens ? `${ens.signal === 'BUY' ? 'BUY candidate' : ens.signal === 'SELL' ? 'SELL candidate' : 'HOLD / no clear signal'} (ensemble strength ${ens.strength}/100)` : 'no ensemble signal available';
  const lines: string[] = [];
  lines.push('## Summary', `The configured strategies currently produce ${c.consensus.bullish > c.consensus.bearish ? 'a mixed-to-bullish' : c.consensus.bearish > c.consensus.bullish ? 'a mixed-to-bearish' : 'a neutral/mixed'} picture for ${c.symbol}: ${sig}. Strategy votes: ${c.consensus.bullish} bullish, ${c.consensus.neutral} neutral, ${c.consensus.bearish} bearish.`);
  lines.push('', '## Observed Data', `- Close: ${f(c.observed.close)} (${f(c.observed.changePercent)}% vs previous close ${f(c.observed.prevClose)})`, `- Volume: ${f(c.observed.volume, 0)} (${f(c.observed.volumeRatio)}× 20-day average)`, `- Turnover: ${f(c.observed.turnover, 0)}`, `- 52-week range: ${f(c.levels.low52w)} – ${f(c.levels.high52w)}`, `- Data source: ${c.dataSource}`);
  lines.push('', '## Indicators (calculated)', `- Trend: ${trendLabel(c)} — EMA20 ${f(c.indicators.ema20)}, EMA50 ${f(c.indicators.ema50)}, EMA200 ${f(c.indicators.ema200)}`, `- Momentum: ${momentumLabel(c.indicators.rsi14)}; ROC(12) ${f(c.indicators.roc12)}%`, `- MACD: ${f(c.indicators.macd, 3)} vs signal ${f(c.indicators.macdSignal, 3)} (histogram ${f(c.indicators.macdHistogram, 3)})`, `- ADX: ${f(c.indicators.adx14, 1)} (+DI ${f(c.indicators.plusDI, 1)}, −DI ${f(c.indicators.minusDI, 1)})`, `- Volatility: ATR ${f(c.indicators.atr14)} (${f(c.indicators.atrPercent)}% of price), 20D HV ${f(c.indicators.hv20, 1)}%`, `- Support / resistance (20D): ${f(c.levels.support20)} / ${f(c.levels.resistance20)}`);
  if (q.includes('change') || q.includes('yesterday')) {
    const p = c.previousIndicators;
    lines.push('', '## What changed vs previous session', `- Close: ${f(p.close)} → ${f(c.observed.close)}`, `- RSI: ${f(p.rsi14, 1)} → ${f(c.indicators.rsi14, 1)}`, `- MACD − signal: ${f(p.macd !== null && p.macdSignal !== null ? p.macd - p.macdSignal : null, 3)} → ${f(c.indicators.macd !== null && c.indicators.macdSignal !== null ? c.indicators.macd - c.indicators.macdSignal : null, 3)}`, `- ADX: ${f(p.adx14, 1)} → ${f(c.indicators.adx14, 1)}`, `- EMA20 vs EMA50: ${p.ema20 !== null && p.ema50 !== null ? (p.ema20 > p.ema50 ? 'above' : 'below') : 'N/A'} → ${c.indicators.ema20 !== null && c.indicators.ema50 !== null ? (c.indicators.ema20 > c.indicators.ema50 ? 'above' : 'below') : 'N/A'}`);
  }
  lines.push('', '## Strategy Signals');
  for (const s of c.strategySignals) {
    const top = s.reasons[0];
    lines.push(`- ${s.strategy}: ${s.signal} (strength ${s.strength})${top ? ` — ${top.direction === 'BULLISH' ? '✓' : top.direction === 'BEARISH' ? '✗' : '•'} ${top.condition}` : ''}`);
  }
  if (ens?.primaryReasons.length) lines.push('', 'Supporting factors:', ...ens.primaryReasons.map((r) => `- ${r}`));
  if (ens?.conflictingFactors.length) lines.push('', 'Conflicting factors:', ...ens.conflictingFactors.map((r) => `- ${r}`));
  lines.push('', '## Historical Context');
  if (c.historicalStats?.length) {
    for (const h of c.historicalStats) lines.push(`- ${h.strategy}: ${h.signals} past signals; avg 5D ${f(h.avgReturn5d)}%, avg 20D ${f(h.avgReturn20d)}%, directional hit rate ${f(h.winRatePct, 1)}% (historical observation only)`);
  } else {
    lines.push('- Historical signal statistics have not been computed for this stock yet (open the Signals → Historical stats panel to compute them).');
  }
  lines.push(`- Market regime: ${c.marketRegime ?? 'N/A'}; stock regime: ${c.stockRegime ?? 'N/A'}`);
  lines.push('', '## Risk Factors', ...risks(c).map((r) => `- ${r}`));
  lines.push('', '## Uncertainty', '- Indicators are derived from past prices and lag; they describe the current setup, not the future.', '- Signal strength is an internal score, not a probability of profit.', '- End-of-day data only; intraday moves, news and corporate actions are not reflected.');
  lines.push('', '## Data Timestamp', c.dataTimestamp, '', '_This is a technical analysis summary based on the available data and does not guarantee future performance._');
  return lines.join('\n');
}

export function templateBacktestAnswer(c: BacktestContext): string {
  const m = (c.metrics ?? {}) as Record<string, number>;
  const lines = [
    '## Summary',
    c.metrics
      ? `The ${c.strategy} backtest on ${c.symbol} (${c.period.from} → ${c.period.to}) produced a total return of ${f(m.totalReturnPct)}% versus ${f(m.buyAndHoldReturnPct)}% for buy-and-hold over the same period, with a maximum drawdown of ${f(m.maxDrawdownPct)}%.`
      : 'This backtest has not completed.',
    '', '## Observed Data (backtest output)',
    `- Trades: ${c.tradeCount} (exit reasons: ${Object.entries(c.exitReasons).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'})`,
    `- Win rate: ${f(m.winRatePct)}%, profit factor ${f(m.profitFactor)}, average trade ${f(m.averageTradePct)}%`,
    `- Average win ${f(m.averageWinningTradePct)}% / average loss ${f(m.averageLosingTradePct)}%, max consecutive losses ${m.maxConsecutiveLosses ?? 'N/A'}`,
    `- Sharpe ${f(m.sharpeRatio)}, Sortino ${f(m.sortinoRatio)}, CAGR ${f(m.cagrPct)}%, exposure ${f(m.exposurePct)}%, total fees NPR ${f(m.totalFees)}`,
    '', '## Interpretation',
    c.tradeCount < 30 ? `- The sample is small (${c.tradeCount} trades), so these statistics are not statistically reliable.` : '- The trade sample is moderately sized.',
    (m.totalReturnPct ?? 0) < (m.buyAndHoldReturnPct ?? 0) ? '- The strategy under-performed buy-and-hold on this stock and period.' : '- The strategy out-performed buy-and-hold on this stock and period.',
    '', '## Risk Factors', ...c.warnings.map((w) => `- ${w}`),
    '', '## Uncertainty', '- A single backtest on one stock and period is highly sensitive to parameters and regime; use walk-forward testing and multiple stocks before drawing conclusions.',
    '', '## Data Timestamp', c.dataTimestamp, '', '_Backtest results are historical simulations and do not guarantee future performance._',
  ];
  return lines.join('\n');
}
