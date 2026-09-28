import type { PrismaClient } from '@prisma/client';
import { AppError } from '@nepse/shared';
import { createCustomStrategy, CustomStrategyDefinitionSchema, defaultRegistry, type TradingStrategy } from '@nepse/strategies';

export interface ResolvedStrategy {
  strategy: TradingStrategy;
  /** Admin-managed parameter overrides merged with any request overrides. */
  parameters: Record<string, number>;
}

/** Resolve a built-in or user-defined (DSL) strategy with stored parameter overrides. */
export async function resolveStrategy(db: PrismaClient, strategyId: string, overrides?: Record<string, number>, userId?: string): Promise<ResolvedStrategy> {
  const row = await db.strategy.findUnique({ where: { id: strategyId }, include: { parameters: true } });
  const builtin = defaultRegistry.get(strategyId);
  if (!row && !builtin) throw new AppError('NOT_FOUND', `Strategy "${strategyId}" not found`);
  if (row && !row.isActive) throw new AppError('NOT_FOUND', `Strategy "${strategyId}" is disabled`);
  const stored = Object.fromEntries((row?.parameters ?? []).map((p) => [p.key, p.value]));
  if (builtin) return { strategy: builtin, parameters: { ...stored, ...overrides } };
  if (row!.ownerId && userId && row!.ownerId !== userId) throw new AppError('FORBIDDEN', 'You do not have access to this strategy');
  const def = CustomStrategyDefinitionSchema.parse(row!.definition);
  return { strategy: createCustomStrategy(row!.id, def), parameters: {} };
}
