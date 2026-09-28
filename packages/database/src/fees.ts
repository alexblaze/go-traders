import type { PrismaClient, FeeSchedule as FeeRow } from '@prisma/client';
import type { FeeSchedule, FeeTier } from '@nepse/backtesting';

export function toFeeSchedule(r: FeeRow): FeeSchedule {
  return {
    id: r.id, name: r.name, type: r.type, rate: r.rate, fixedAmount: r.fixedAmount, appliesTo: r.appliesTo,
    effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo, tiers: (r.tiers as FeeTier[] | null) ?? null,
    minAmount: r.minAmount, holdingDaysMin: r.holdingDaysMin, holdingDaysMax: r.holdingDaysMax,
  };
}

export async function loadFeeSchedules(db: PrismaClient): Promise<FeeSchedule[]> {
  return (await db.feeSchedule.findMany({ orderBy: { effectiveFrom: 'asc' } })).map(toFeeSchedule);
}
