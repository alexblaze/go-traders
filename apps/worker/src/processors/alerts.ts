import { evaluateAlert, latestTradingDate, loadCandles, type PrismaClient } from '@nepse/database';
import { computeSnapshot } from '@nepse/indicators';
import type { Job } from 'bullmq';
import { logger } from '../logger';

/**
 * Evaluates all active alerts against the latest candle. Each alert fires at most once per
 * trading date; non-repeating alerts are deactivated after firing.
 * Returns ids of notifications that need external delivery (email etc).
 */
export async function evaluateAlerts(db: PrismaClient, job: Job): Promise<{ evaluated: number; triggered: number; toDeliver: string[] }> {
  const date = await latestTradingDate(db);
  if (!date) return { evaluated: 0, triggered: 0, toDeliver: [] };
  const alerts = await db.alert.findMany({ where: { isActive: true, OR: [{ lastEvaluatedFor: null }, { lastEvaluatedFor: { lt: date } }] }, include: { stock: true } });
  const byStock = new Map<string, typeof alerts>();
  alerts.forEach((a) => byStock.set(a.stockId, [...(byStock.get(a.stockId) ?? []), a]));
  let triggered = 0;
  const toDeliver: string[] = [];
  for (const [stockId, list] of byStock) {
    const candles = await loadCandles(db, stockId, { limit: 400 });
    if (!candles.length || candles[candles.length - 1].date.getTime() !== date.getTime()) continue;
    const cur = computeSnapshot(candles) as unknown as Record<string, number>;
    const prev = computeSnapshot(candles.slice(0, -1)) as unknown as Record<string, number>;
    const signals = await db.signal.findMany({ where: { stockId, timestamp: date }, select: { strategyId: true, signal: true, strength: true } });
    for (const a of list) {
      const res = evaluateAlert(a, { cur, prev, signals });
      await db.alert.update({ where: { id: a.id }, data: { lastEvaluatedFor: date, ...(res.triggered ? { lastTriggeredAt: new Date(), isActive: a.repeat } : {}) } });
      if (!res.triggered) continue;
      triggered++;
      logger.info({ jobId: job.id, alertId: a.id, symbol: a.stock.symbol, type: a.type }, 'alert triggered');
      for (const channel of a.channels) {
        const n = await db.notification.create({
          data: {
            userId: a.userId, alertId: a.id, channel, title: `${a.stock.symbol}: ${a.type.replace(/_/g, ' ').toLowerCase()}`,
            body: `${res.message} on ${date.toISOString().slice(0, 10)}.${a.note ? ` Note: ${a.note}` : ''} This is an automated research alert, not financial advice.`,
            data: { symbol: a.stock.symbol, type: a.type, date: date.toISOString().slice(0, 10) },
            status: channel === 'IN_APP' ? 'SENT' : 'PENDING', sentAt: channel === 'IN_APP' ? new Date() : null,
          },
        });
        if (channel !== 'IN_APP') toDeliver.push(n.id);
      }
    }
  }
  return { evaluated: alerts.length, triggered, toDeliver };
}
