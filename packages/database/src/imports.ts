import { Prisma, type PrismaClient, type DataSource } from '@prisma/client';
import { groupBySymbol, parsePriceCsv, type CsvPriceRow } from '@nepse/market-data';
import { AppError } from '@nepse/shared';
import { recomputeDerivedFields } from './candles';
import { rebuildDerivedIndex } from './market-index';

/** Symbols in an import file that represent market indices rather than stocks. */
export const INDEX_SYMBOLS = new Set(['NEPSE', 'SENSITIVE', 'FLOAT', 'SENFLOAT']);

export async function knownSymbolSet(db: PrismaClient): Promise<Set<string>> {
  return new Set((await db.stock.findMany({ select: { symbol: true } })).map((s) => s.symbol));
}

/** Build a validated preview of a CSV import without writing prices. */
export async function previewImport(db: PrismaClient, csv: string, opts: { createStocks: boolean }) {
  const known = await knownSymbolSet(db);
  const allowed = opts.createStocks ? undefined : new Set([...known, ...INDEX_SYMBOLS]);
  const result = parsePriceCsv(csv, { knownSymbols: allowed });
  // Detect existing (symbol,date) rows to warn about updates.
  const existing = new Set<string>();
  const bySymbol = groupBySymbol(result.rows);
  for (const [symbol, rows] of bySymbol) {
    if (!known.has(symbol)) continue;
    const dates = await db.dailyPrice.findMany({
      where: { stock: { symbol }, date: { gte: rows[0].date, lte: rows[rows.length - 1].date } },
      select: { date: true },
    });
    dates.forEach((d) => existing.add(`${symbol}|${d.date.toISOString().slice(0, 10)}`));
  }
  const final = existing.size ? parsePriceCsv(csv, { knownSymbols: allowed, existingKeys: existing }) : result;
  return { ...final, newSymbols: final.symbols.filter((s) => !known.has(s) && !INDEX_SYMBOLS.has(s)) };
}

export interface CommitResult {
  inserted: number;
  updated: number;
  symbols: number;
}

async function upsertPrices(db: PrismaClient, stockId: string, rows: CsvPriceRow[], source: DataSource, importId: string): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000);
    const values = Prisma.join(
      chunk.map((r) => Prisma.sql`(${stockId}, ${r.date}::date, ${r.open}, ${r.high}, ${r.low}, ${r.close}, ${r.volume}, ${r.turnover ?? null}, ${source}::"DataSource", ${importId}, now(), now())`),
    );
    const res = await db.$queryRaw<{ inserted: boolean }[]>`
      INSERT INTO daily_prices (stock_id, date, open, high, low, close, volume, turnover, source, import_id, created_at, updated_at)
      VALUES ${values}
      ON CONFLICT (stock_id, date) DO UPDATE SET
        open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low, close = EXCLUDED.close,
        volume = EXCLUDED.volume, turnover = EXCLUDED.turnover, source = EXCLUDED.source,
        import_id = EXCLUDED.import_id, updated_at = now()
      RETURNING (xmax = 0) AS inserted`;
    for (const r of res) r.inserted ? inserted++ : updated++;
  }
  return { inserted, updated };
}

/**
 * Commit a previewed import: re-validates the stored CSV, creates stocks if requested,
 * upserts prices (idempotent on symbol+date), refreshes derived fields and the derived index.
 */
export async function commitImport(db: PrismaClient, importId: string, onProgress?: (pct: number) => Promise<void> | void): Promise<CommitResult> {
  const imp = await db.marketDataImport.findUnique({ where: { id: importId } });
  if (!imp || !imp.payload) throw new AppError('NOT_FOUND', 'Import not found or has no payload');
  await db.marketDataImport.update({ where: { id: importId }, data: { status: 'PROCESSING' } });
  try {
    const known = await knownSymbolSet(db);
    const parsed = parsePriceCsv(imp.payload, { knownSymbols: imp.createStocks ? undefined : new Set([...known, ...INDEX_SYMBOLS]) });
    const groups = [...groupBySymbol(parsed.rows)];
    let inserted = 0;
    let updated = 0;
    let done = 0;
    for (const [symbol, rows] of groups) {
      if (INDEX_SYMBOLS.has(symbol)) {
        for (const r of rows) {
          await db.marketIndex.upsert({
            where: { name_date: { name: symbol, date: r.date } },
            create: { name: symbol, date: r.date, value: r.close, volume: r.volume, turnover: r.turnover ?? null, source: 'IMPORTED' },
            update: { value: r.close, volume: r.volume, turnover: r.turnover ?? null, source: 'IMPORTED' },
          });
        }
        inserted += rows.length;
      } else {
        let stock = await db.stock.findUnique({ where: { symbol } });
        if (!stock) {
          const company = await db.company.create({ data: { name: symbol } });
          stock = await db.stock.create({ data: { symbol, companyId: company.id, dataSource: 'IMPORTED' } });
        }
        const r = await upsertPrices(db, stock.id, rows, 'IMPORTED', importId);
        inserted += r.inserted;
        updated += r.updated;
        await recomputeDerivedFields(db, stock.id, rows[0].date);
        if (stock.isDemo === false && stock.dataSource !== 'IMPORTED') await db.stock.update({ where: { id: stock.id }, data: { dataSource: 'IMPORTED' } });
      }
      done++;
      await onProgress?.(Math.round((done / groups.length) * 95));
    }
    await rebuildDerivedIndex(db);
    await db.marketDataImport.update({
      where: { id: importId },
      data: { status: 'COMPLETED', insertedRows: inserted, updatedRows: updated, completedAt: new Date(), payload: null },
    });
    await onProgress?.(100);
    return { inserted, updated, symbols: groups.length };
  } catch (e) {
    await db.marketDataImport.update({ where: { id: importId }, data: { status: 'FAILED', error: (e as Error).message } });
    throw e;
  }
}
