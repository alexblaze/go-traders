import { daysBetween } from '@nepse/shared';

export type FeeType = 'BROKER_COMMISSION' | 'SEBON_FEE' | 'DP_CHARGE' | 'CAPITAL_GAINS_TAX' | 'OTHER';
export type FeeAppliesTo = 'BUY' | 'SELL' | 'BOTH';

export interface FeeTier {
  /** Upper bound of transaction amount (inclusive) for this tier; null = no upper bound. */
  upTo: number | null;
  rate: number;
}

/**
 * A single fee component with an effective-date range. Rates are fractions (0.0036 = 0.36%).
 * Rates are configuration data — they must be verified against current SEBON/NEPSE/CDSC/IRD rules.
 */
export interface FeeSchedule {
  id: string;
  name: string;
  type: FeeType;
  rate: number;
  fixedAmount: number;
  appliesTo: FeeAppliesTo;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  /** Tiered rates by transaction amount (replaces `rate` when present). */
  tiers?: FeeTier[] | null;
  minAmount?: number | null;
  /** Capital-gains tax only: applies when holding period (days) is within [min, max]. */
  holdingDaysMin?: number | null;
  holdingDaysMax?: number | null;
}

export interface FeeLine {
  scheduleId: string;
  name: string;
  type: FeeType;
  amount: number;
}

export interface FeeBreakdown {
  total: number;
  lines: FeeLine[];
}

export function isEffective(s: FeeSchedule, date: Date): boolean {
  return s.effectiveFrom.getTime() <= date.getTime() && (s.effectiveTo === null || date.getTime() <= s.effectiveTo.getTime());
}

function tieredRate(tiers: FeeTier[], amount: number): number {
  const sorted = [...tiers].sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
  return (sorted.find((t) => t.upTo === null || amount <= t.upTo) ?? sorted[sorted.length - 1]).rate;
}

export interface TradeCostInput {
  side: 'BUY' | 'SELL';
  amount: number;
  date: Date;
  /** Required for capital-gains tax on sells: realised gain before tax. */
  realizedGain?: number;
  entryDate?: Date;
}

/** Compute the fees applicable to a trade, using only schedules effective on the trade date. */
export function calculateFees(input: TradeCostInput, schedules: FeeSchedule[]): FeeBreakdown {
  const lines: FeeLine[] = [];
  for (const s of schedules) {
    if (!isEffective(s, input.date)) continue;
    if (s.appliesTo !== 'BOTH' && s.appliesTo !== input.side) continue;
    let amount = 0;
    if (s.type === 'CAPITAL_GAINS_TAX') {
      if (input.side !== 'SELL' || !input.realizedGain || input.realizedGain <= 0) continue;
      if (input.entryDate) {
        const held = daysBetween(input.entryDate, input.date);
        if (s.holdingDaysMin != null && held < s.holdingDaysMin) continue;
        if (s.holdingDaysMax != null && held > s.holdingDaysMax) continue;
      }
      amount = input.realizedGain * s.rate + s.fixedAmount;
    } else {
      const rate = s.tiers && s.tiers.length ? tieredRate(s.tiers, input.amount) : s.rate;
      amount = input.amount * rate;
      if (s.minAmount != null && amount > 0) amount = Math.max(amount, s.minAmount);
      amount += s.fixedAmount;
    }
    if (amount > 0) lines.push({ scheduleId: s.id, name: s.name, type: s.type, amount: round2(amount) });
  }
  return { total: round2(lines.reduce((a, l) => a + l.amount, 0)), lines };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Flat-rate helper for simple configurations/tests. */
export function flatCommission(rate: number, fixed = 0): FeeSchedule[] {
  return [{ id: 'flat', name: 'Commission', type: 'BROKER_COMMISSION', rate, fixedAmount: fixed, appliesTo: 'BOTH', effectiveFrom: new Date(0), effectiveTo: null }];
}

/**
 * ILLUSTRATIVE Nepal fee structure for demos. NOT VERIFIED — values reflect commonly cited
 * published structures but must be checked against current SEBON / NEPSE / CDSC / IRD notices
 * before relying on backtest results. Admins manage the real schedules in the database.
 */
export const ILLUSTRATIVE_NEPAL_FEES: FeeSchedule[] = [
  {
    id: 'illustrative-broker', name: 'Broker commission (illustrative, tiered)', type: 'BROKER_COMMISSION', rate: 0.0036, fixedAmount: 0, appliesTo: 'BOTH',
    effectiveFrom: new Date('2000-01-01T00:00:00Z'), effectiveTo: null, minAmount: 10,
    tiers: [
      { upTo: 50000, rate: 0.0036 }, { upTo: 500000, rate: 0.0033 }, { upTo: 2000000, rate: 0.0031 },
      { upTo: 10000000, rate: 0.0027 }, { upTo: null, rate: 0.0024 },
    ],
  },
  { id: 'illustrative-sebon', name: 'SEBON fee (illustrative)', type: 'SEBON_FEE', rate: 0.00015, fixedAmount: 0, appliesTo: 'BOTH', effectiveFrom: new Date('2000-01-01T00:00:00Z'), effectiveTo: null },
  { id: 'illustrative-dp', name: 'DP charge (illustrative, per sell)', type: 'DP_CHARGE', rate: 0, fixedAmount: 25, appliesTo: 'SELL', effectiveFrom: new Date('2000-01-01T00:00:00Z'), effectiveTo: null },
  { id: 'illustrative-cgt-short', name: 'Capital gains tax ≤365d (illustrative)', type: 'CAPITAL_GAINS_TAX', rate: 0.075, fixedAmount: 0, appliesTo: 'SELL', effectiveFrom: new Date('2000-01-01T00:00:00Z'), effectiveTo: null, holdingDaysMax: 365 },
  { id: 'illustrative-cgt-long', name: 'Capital gains tax >365d (illustrative)', type: 'CAPITAL_GAINS_TAX', rate: 0.05, fixedAmount: 0, appliesTo: 'SELL', effectiveFrom: new Date('2000-01-01T00:00:00Z'), effectiveTo: null, holdingDaysMin: 366 },
];
