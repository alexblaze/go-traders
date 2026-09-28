import type { PrismaClient } from '@prisma/client';
import { AppError, type OHLCV } from '@nepse/shared';

export async function findStockBySymbol(db: PrismaClient, symbol: string) {
  const stock = await db.stock.findUnique({ where: { symbol: symbol.toUpperCase() }, include: { company: { include: { sector: true } } } });
  if (!stock) throw new AppError('INVALID_SYMBOL', 'The requested stock symbol was not found.');
  return stock;
}

/** Load ascending daily candles for a stock. */
export async function loadCandles(db: PrismaClient, stockId: string, opts: { from?: Date; to?: Date; limit?: number } = {}): Promise<OHLCV[]> {
  const where = { stockId, date: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } };
  const rows = opts.limit
    ? (await db.dailyPrice.findMany({ where, orderBy: { date: 'desc' }, take: opts.limit })).reverse()
    : await db.dailyPrice.findMany({ where, orderBy: { date: 'asc' } });
  return rows.map((r) => ({ date: r.date, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume, turnover: r.turnover ?? undefined }));
}

/** Most recent trading date present in the database. */
export async function latestTradingDate(db: PrismaClient): Promise<Date | null> {
  const r = await db.dailyPrice.aggregate({ _max: { date: true } });
  return r._max.date;
}

/**
 * Derive previousClose / change / changePercent for a stock's prices (from `from` onward).
 * Keeps derived columns consistent after imports without touching OHLCV values.
 */
export async function recomputeDerivedFields(db: PrismaClient, stockId: string, from?: Date): Promise<number> {
  const prior = from ? await db.dailyPrice.findFirst({ where: { stockId, date: { lt: from } }, orderBy: { date: 'desc' } }) : null;
  const rows = await db.dailyPrice.findMany({ where: { stockId, ...(from ? { date: { gte: from } } : {}) }, orderBy: { date: 'asc' }, select: { id: true, close: true } });
  let prev = prior?.close ?? null;
  const updates = rows.map((r) => {
    const change = prev !== null ? r.close - prev : null;
    const pct = prev ? (change! / prev) * 100 : null;
    const u = db.dailyPrice.update({ where: { id: r.id }, data: { previousClose: prev, change, changePercent: pct } });
    prev = r.close;
    return u;
  });
  for (let i = 0; i < updates.length; i += 500) await db.$transaction(updates.slice(i, i + 500));
  return updates.length;
}
