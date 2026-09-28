import { computeSnapshot, type IndicatorSnapshot } from '@nepse/indicators';
import type { OHLCV } from '@nepse/shared';
import { z } from 'zod';

/**
 * Structured JSON DSL for user-defined conditions (screener + strategy builder).
 * Users NEVER supply executable code — only whitelisted fields, comparators and numbers.
 */
export const DSL_FIELDS = [
  'close', 'prevClose', 'changePercent', 'volume', 'turnover',
  'sma20', 'sma50', 'sma200', 'ema20', 'ema50', 'ema200',
  'rsi14', 'macd', 'macdSignal', 'macdHistogram', 'adx14', 'plusDI', 'minusDI',
  'bbUpper', 'bbMiddle', 'bbLower', 'bbBandwidth', 'atr14', 'atrPercent', 'hv20', 'roc12',
  'stochK', 'stochD', 'mfi14', 'cmf20', 'obv', 'volumeSma20', 'volumeRatio',
  'high52w', 'low52w', 'resistance20', 'support20',
] as const satisfies readonly (keyof IndicatorSnapshot)[];

export type DslField = (typeof DSL_FIELDS)[number];

export const FIELD_LABELS: Record<DslField, string> = {
  close: 'Price (close)', prevClose: 'Previous close', changePercent: 'Change %', volume: 'Volume', turnover: 'Turnover',
  sma20: 'SMA 20', sma50: 'SMA 50', sma200: 'SMA 200', ema20: 'EMA 20', ema50: 'EMA 50', ema200: 'EMA 200',
  rsi14: 'RSI 14', macd: 'MACD', macdSignal: 'MACD signal', macdHistogram: 'MACD histogram', adx14: 'ADX 14',
  plusDI: '+DI', minusDI: '-DI', bbUpper: 'Upper Bollinger Band', bbMiddle: 'Middle Bollinger Band', bbLower: 'Lower Bollinger Band',
  bbBandwidth: 'Bollinger bandwidth', atr14: 'ATR 14', atrPercent: 'ATR % of price', hv20: 'Historical volatility 20D',
  roc12: 'ROC 12', stochK: 'Stochastic %K', stochD: 'Stochastic %D', mfi14: 'MFI 14', cmf20: 'CMF 20', obv: 'OBV',
  volumeSma20: '20D average volume', volumeRatio: 'Volume / 20D average', high52w: '52-week high', low52w: '52-week low',
  resistance20: '20D resistance', support20: '20D support',
};

export const OperandSchema = z.union([
  z.object({ field: z.enum(DSL_FIELDS), multiplier: z.number().finite().optional() }),
  z.object({ value: z.number().finite() }),
]);
export type Operand = z.infer<typeof OperandSchema>;

export const COMPARATORS = ['<', '<=', '>', '>=', '==', 'crossesAbove', 'crossesBelow'] as const;

export const ComparisonSchema = z.object({
  left: OperandSchema,
  comparator: z.enum(COMPARATORS),
  right: OperandSchema,
});
export type Comparison = z.infer<typeof ComparisonSchema>;

export type ConditionGroup = { op: 'AND' | 'OR'; conditions: (Comparison | ConditionGroup)[] };

export const ConditionGroupSchema: z.ZodType<ConditionGroup> = z.lazy(() =>
  z.object({
    op: z.enum(['AND', 'OR']),
    conditions: z.array(z.union([ComparisonSchema, ConditionGroupSchema])).min(1).max(25),
  }),
);

export const CustomStrategyDefinitionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  buy: ConditionGroupSchema,
  sell: ConditionGroupSchema.optional(),
});
export type CustomStrategyDefinition = z.infer<typeof CustomStrategyDefinitionSchema>;

export interface ConditionTrace {
  description: string;
  passed: boolean;
  left: number | null;
  right: number | null;
}

function resolve(o: Operand, s: IndicatorSnapshot): number {
  if ('value' in o) return o.value;
  const v = s[o.field];
  return Number.isFinite(v) ? v * (o.multiplier ?? 1) : NaN;
}

export function describeOperand(o: Operand): string {
  if ('value' in o) return String(o.value);
  const base = FIELD_LABELS[o.field];
  return o.multiplier && o.multiplier !== 1 ? `${base} × ${o.multiplier}` : base;
}

const isGroup = (c: Comparison | ConditionGroup): c is ConditionGroup => 'op' in c;

/**
 * Evaluate a condition tree. `prev` is the snapshot one bar earlier (needed for cross operators).
 * Missing values (insufficient history) make a comparison fail, never pass.
 */
export function evaluateGroup(group: ConditionGroup, cur: IndicatorSnapshot, prev?: IndicatorSnapshot, trace: ConditionTrace[] = []): boolean {
  const results = group.conditions.map((c) => (isGroup(c) ? evaluateGroup(c, cur, prev, trace) : evaluateComparison(c, cur, prev, trace)));
  return group.op === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

export function evaluateComparison(c: Comparison, cur: IndicatorSnapshot, prev: IndicatorSnapshot | undefined, trace: ConditionTrace[] = []): boolean {
  const l = resolve(c.left, cur);
  const r = resolve(c.right, cur);
  let passed = false;
  if (Number.isFinite(l) && Number.isFinite(r)) {
    switch (c.comparator) {
      case '<': passed = l < r; break;
      case '<=': passed = l <= r; break;
      case '>': passed = l > r; break;
      case '>=': passed = l >= r; break;
      case '==': passed = Math.abs(l - r) < 1e-9; break;
      case 'crossesAbove':
      case 'crossesBelow': {
        if (!prev) break;
        const pl = resolve(c.left, prev);
        const pr = resolve(c.right, prev);
        if (!Number.isFinite(pl) || !Number.isFinite(pr)) break;
        passed = c.comparator === 'crossesAbove' ? pl <= pr && l > r : pl >= pr && l < r;
        break;
      }
    }
  }
  trace.push({
    description: `${describeOperand(c.left)} ${c.comparator} ${describeOperand(c.right)}`,
    passed,
    left: Number.isFinite(l) ? l : null,
    right: Number.isFinite(r) ? r : null,
  });
  return passed;
}

export function groupUsesCross(group: ConditionGroup): boolean {
  return group.conditions.some((c) => (isGroup(c) ? groupUsesCross(c) : c.comparator === 'crossesAbove' || c.comparator === 'crossesBelow'));
}

/** Evaluate a group directly against candles (computes current + previous snapshot). */
export function evaluateOnCandles(group: ConditionGroup, candles: OHLCV[]): { passed: boolean; trace: ConditionTrace[]; snapshot: IndicatorSnapshot } {
  const cur = computeSnapshot(candles);
  const prev = groupUsesCross(group) && candles.length > 1 ? computeSnapshot(candles.slice(0, -1)) : undefined;
  const trace: ConditionTrace[] = [];
  const passed = evaluateGroup(group, cur, prev, trace);
  return { passed, trace, snapshot: cur };
}
