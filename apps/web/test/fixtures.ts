export const summary = {
  asOf: '2026-09-24T00:00:00.000Z', dataSource: 'DEMO', dataSources: ['DEMO'],
  index: { name: 'Derived Equal-Weight Index', isDerived: true, value: 1078.35, change: -1.76, changePercent: -0.16, note: 'NOT the official NEPSE index.' },
  totals: { turnover: 803084599, volume: 1873838, stocksTraded: 18, advancers: 8, decliners: 10, unchanged: 0, high52w: 1, low52w: 2, breadth: 0.444, advanceDeclineRatio: 0.8 },
};

export const reason = (condition: string, direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL') => ({ indicator: 'X', condition, value: 1, threshold: null, direction });

export const signal = (strategyId: string, s: 'BUY' | 'SELL' | 'HOLD', extra: Record<string, unknown> = {}) => ({
  id: `sig-${strategyId}`, symbol: 'DMCB1', companyName: 'Demo Bank', sector: 'Commercial Banks', isDemo: true, strategyId, strategyName: strategyId.toUpperCase(),
  timeframe: '1D', timestamp: '2026-09-24T00:00:00.000Z', generatedAt: '2026-09-24T10:00:00.000Z', signal: s, label: s, strength: 78,
  strengthNote: 'not a probability', price: 505, marketRegime: 'UPTREND', reasons: [reason('EMA20 above EMA50', 'BULLISH'), reason('RSI approaching overbought', 'BEARISH')],
  indicatorSnapshot: {}, parameters: {}, meta: {}, indicatorsUsed: ['EMA'], assumptions: ['Trends persist.'], limitations: ['Lagging.'], ...extra,
});
