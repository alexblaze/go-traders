import { analyzeStock, getRegimeConfig, getStrategyOverrides, latestTradingDate } from '@nepse/database';
import { QUEUE_NAMES } from '@nepse/config';
import type { AppDeps } from './context';
import { enqueue } from './queues';

const SYNC_LIMIT = 150;

/**
 * Ensures every stock that traded on the latest date has a stored indicator snapshot and signals.
 * Small gaps are filled synchronously (guarded by a Redis lock); large gaps are delegated to the
 * worker's signal-generation queue so API requests stay fast.
 */
export async function ensureAnalysis(deps: AppDeps): Promise<{ date: Date | null; pending: number }> {
  const { db, redis, queues } = deps;
  const date = await latestTradingDate(db);
  if (!date) return { date: null, pending: 0 };
  const missing = await db.$queryRaw<{ id: string; symbol: string }[]>`
    SELECT s.id, s.symbol FROM stocks s
    JOIN daily_prices p ON p.stock_id = s.id AND p.date = ${date}::date
    LEFT JOIN technical_indicators t ON t.stock_id = s.id AND t.date = ${date}::date
    WHERE t.id IS NULL`;
  if (!missing.length) return { date, pending: 0 };
  if (missing.length > SYNC_LIMIT) {
    await enqueue(queues, QUEUE_NAMES.signalGeneration, 'generate-all', { reason: 'api-detected-stale' }, { jobId: `generate-all-${date.toISOString().slice(0, 10)}` });
    return { date, pending: missing.length };
  }
  const lockKey = `nepse:lock:analysis:${date.toISOString().slice(0, 10)}`;
  const got = await redis.set(lockKey, '1', 'EX', 60, 'NX').catch(() => 'OK');
  if (!got) return { date, pending: missing.length };
  try {
    const regimeConfig = await getRegimeConfig(db);
    const overrides = await getStrategyOverrides(db);
    for (const s of missing) await analyzeStock(db, s, { persist: true, regimeConfig, overrides });
  } finally {
    await redis.del(lockKey).catch(() => undefined);
  }
  return { date, pending: 0 };
}
