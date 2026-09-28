import { rebuildDerivedIndex, recomputeDerivedFields, upsertPrices, type PrismaClient } from '@nepse/database';
import type { MarketDataProvider } from '@nepse/market-data';
import { addDays } from '@nepse/shared';
import type { Job } from 'bullmq';
import { logger } from '../logger';

/** Pull symbols and recent prices from the configured provider into the database. */
export async function syncMarketData(db: PrismaClient, provider: MarketDataProvider, job: Job<{ symbols?: string[]; days?: number }>) {
  const days = job.data.days ?? 30;
  const to = new Date();
  const from = addDays(to, -days);
  const listed = await provider.getSymbols();
  const wanted = job.data.symbols?.length ? listed.filter((s) => job.data.symbols!.includes(s.symbol)) : listed;
  const source = provider.source === 'LIVE' ? 'LIVE' : provider.source === 'MOCK' ? 'MOCK' : provider.source === 'DEMO' ? 'DEMO' : 'IMPORTED';
  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < wanted.length; i++) {
    const s = wanted[i];
    try {
      let stock = await db.stock.findUnique({ where: { symbol: s.symbol } });
      if (!stock) {
        const sector = s.sector ? await db.sector.upsert({ where: { name: s.sector }, create: { name: s.sector }, update: {} }) : null;
        const company = await db.company.create({ data: { name: s.companyName, sectorId: sector?.id, subSector: s.subSector ?? null, listedDate: s.listedDate ?? null, sharesOutstanding: s.sharesOutstanding ?? null, paidUpCapital: s.paidUpCapital ?? null } });
        stock = await db.stock.create({ data: { symbol: s.symbol, companyId: company.id, status: s.status, isDemo: !!s.isDemo, dataSource: source } });
      }
      const candles = await provider.getHistoricalPrices(s.symbol, from, to, '1D');
      if (candles.length) {
        const r = await upsertPrices(db, stock.id, candles, source, null);
        inserted += r.inserted;
        updated += r.updated;
        await recomputeDerivedFields(db, stock.id, candles[0].date);
      }
    } catch (e) {
      logger.warn({ jobId: job.id, symbol: s.symbol, err: (e as Error).message }, 'symbol sync failed');
    }
    await job.updateProgress(Math.round(((i + 1) / wanted.length) * 100));
  }
  await rebuildDerivedIndex(db);
  return { provider: provider.name, symbols: wanted.length, inserted, updated };
}
