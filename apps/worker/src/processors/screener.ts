import { latestSnapshots, type Prisma, type PrismaClient } from '@nepse/database';
import type { IndicatorSnapshot } from '@nepse/indicators';
import { ConditionGroupSchema, evaluateGroup, groupUsesCross } from '@nepse/strategies';
import type { Job } from 'bullmq';

/**
 * Nightly scan: evaluates every saved screen (without cross operators) against the latest
 * snapshots and stores match counts, so users see how many stocks match without re-running.
 */
export async function dailyScan(db: PrismaClient, job: Job) {
  const snaps = await latestSnapshots(db);
  const screens = await db.savedScreen.findMany();
  const results: Record<string, { name: string; matches: number; symbols: string[] }> = {};
  const stocks = new Map((await db.stock.findMany({ select: { id: true, symbol: true } })).map((s) => [s.id, s.symbol]));
  for (const sc of screens) {
    const parsed = ConditionGroupSchema.safeParse((sc.definition as { filter?: unknown }).filter);
    if (!parsed.success || groupUsesCross(parsed.data)) continue;
    const symbols: string[] = [];
    for (const [stockId, snap] of snaps) {
      const v = Object.fromEntries(Object.entries(snap.values).map(([k, x]) => [k, x ?? NaN])) as unknown as IndicatorSnapshot;
      if (evaluateGroup(parsed.data, v)) symbols.push(stocks.get(stockId) ?? stockId);
    }
    results[sc.id] = { name: sc.name, matches: symbols.length, symbols: symbols.slice(0, 50) };
  }
  await db.appSetting.upsert({ where: { key: 'screener.dailyScan' }, create: { key: 'screener.dailyScan', value: results as Prisma.InputJsonValue }, update: { value: results as Prisma.InputJsonValue } });
  await job.updateProgress(100);
  return { screens: Object.keys(results).length };
}
