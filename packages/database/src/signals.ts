import type { Prisma, PrismaClient } from '@prisma/client';
import type { TradingSignal } from '@nepse/shared';

const clean = (v: number | undefined) => (v !== undefined && Number.isFinite(v) ? v : null);

/** Persist a signal idempotently (unique per stock/strategy/candle date) with its reason components. */
export async function saveSignal(
  db: PrismaClient,
  stockId: string,
  signal: TradingSignal,
  snapshot: Record<string, number | null>,
  parameters?: Record<string, number>,
) {
  const data = {
    signal: signal.signal,
    strength: signal.strength,
    price: signal.price,
    indicatorSnapshot: { ...snapshot, ...Object.fromEntries(Object.entries(signal.indicators).map(([k, v]) => [`strategy.${k}`, clean(v)])) } as Prisma.InputJsonValue,
    marketRegime: signal.marketRegime ?? null,
    parameters: (parameters ?? {}) as Prisma.InputJsonValue,
    meta: JSON.parse(JSON.stringify(signal.meta ?? {}, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v))) as Prisma.InputJsonValue,
    generatedAt: new Date(),
  };
  const components = signal.reasons.map((r, i) => ({ ordinal: i, indicator: r.indicator, condition: r.condition, value: clean(r.value), threshold: clean(r.threshold), direction: r.direction }));
  return db.$transaction(async (tx) => {
    const saved = await tx.signal.upsert({
      where: { stockId_strategyId_timestamp: { stockId, strategyId: signal.strategyId, timestamp: signal.timestamp } },
      create: { stockId, strategyId: signal.strategyId, timestamp: signal.timestamp, ...data },
      update: data,
    });
    await tx.signalComponent.deleteMany({ where: { signalId: saved.id } });
    await tx.signalComponent.createMany({ data: components.map((c) => ({ ...c, signalId: saved.id })) });
    return saved;
  });
}
