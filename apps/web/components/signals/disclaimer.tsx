export function Disclaimer({ className = '' }: { className?: string }) {
  return (
    <p className={`text-[11px] leading-relaxed text-muted-foreground ${className}`}>
      Research and decision-support only — not financial advice. Signals are technical-analysis outputs based on available data and do not guarantee future
      performance. Signal strength is an internal metric, not a probability of profit.
    </p>
  );
}

export const BACKTEST_WARNINGS_SHORT = [
  'Historical performance does not guarantee future results.',
  'Results depend on modelled transaction costs, slippage and liquidity.',
  'Missing data, survivorship bias and look-ahead bias can distort results.',
  'Parameters tuned on this period may be overfitted; market regimes change.',
];
