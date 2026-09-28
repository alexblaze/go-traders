/**
 * Seed script — idempotent.
 *  - roles, admin user (from ADMIN_EMAIL / ADMIN_PASSWORD)
 *  - built-in strategies
 *  - ILLUSTRATIVE fee schedules (isVerified = false — admins must verify)
 *  - app settings (market calendar, regime methodology)
 *  - DEMO stocks and SYNTHETIC prices from data/sample (clearly labelled DEMO DATA)
 */
import { ILLUSTRATIVE_NEPAL_FEES } from '@nepse/backtesting';
import { CsvProvider } from '@nepse/market-data';
import { DEFAULT_NEPSE_CALENDAR } from '@nepse/shared';
import { BUILTIN_STRATEGIES, DEFAULT_REGIME_CONFIG } from '@nepse/strategies';
import bcrypt from 'bcryptjs';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Prisma } from '@prisma/client';
import { prisma } from './client';
import { recomputeDerivedFields } from './candles';
import { rebuildDerivedIndex } from './market-index';

const here = dirname(fileURLToPath(import.meta.url));

function findSampleDir(): string | null {
  const candidates = [process.env.SEED_DATA_DIR, process.env.MARKET_DATA_CSV_DIR, resolve(here, '../../../data/sample'), resolve(process.cwd(), 'data/sample')].filter(Boolean) as string[];
  return candidates.find((d) => existsSync(resolve(d, 'stocks.csv'))) ?? null;
}

export async function seed(opts: { demoData?: boolean } = {}) {
  const log = (m: string) => console.log(`[seed] ${m}`);
  for (const name of ['USER', 'ADMIN']) {
    await prisma.role.upsert({ where: { name }, create: { name, description: name === 'ADMIN' ? 'Administrator' : 'Standard user' }, update: {} });
  }
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } });
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const existing = await prisma.user.findUnique({ where: { email: adminEmail.toLowerCase() } });
    if (!existing) {
      await prisma.user.create({ data: { email: adminEmail.toLowerCase(), passwordHash: await bcrypt.hash(adminPassword, 12), name: 'Administrator', roleId: adminRole.id } });
      log(`admin user created: ${adminEmail}`);
    }
  } else {
    log('ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin user');
  }

  for (const s of BUILTIN_STRATEGIES) {
    await prisma.strategy.upsert({
      where: { id: s.id },
      create: { id: s.id, name: s.name, description: s.description, category: s.category, isBuiltin: true },
      update: { name: s.name, description: s.description, category: s.category },
    });
  }
  log(`${BUILTIN_STRATEGIES.length} built-in strategies`);

  if ((await prisma.feeSchedule.count()) === 0) {
    for (const f of ILLUSTRATIVE_NEPAL_FEES) {
      await prisma.feeSchedule.create({
        data: {
          name: f.name, type: f.type, rate: f.rate, fixedAmount: f.fixedAmount, appliesTo: f.appliesTo,
          tiers: (f.tiers ?? undefined) as Prisma.InputJsonValue | undefined, minAmount: f.minAmount ?? null,
          holdingDaysMin: f.holdingDaysMin ?? null, holdingDaysMax: f.holdingDaysMax ?? null,
          effectiveFrom: f.effectiveFrom, effectiveTo: f.effectiveTo, isVerified: false,
          sourceNote: 'ILLUSTRATIVE ONLY — verify against current SEBON / NEPSE / CDSC / IRD notices before use.',
        },
      });
    }
    log('illustrative fee schedules (unverified)');
  }

  const settings: Record<string, unknown> = {
    'market.calendar': DEFAULT_NEPSE_CALENDAR,
    'market.regime': DEFAULT_REGIME_CONFIG,
    'signals.defaultStrategies': BUILTIN_STRATEGIES.map((s) => s.id),
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.appSetting.upsert({ where: { key }, create: { key, value: value as Prisma.InputJsonValue }, update: {} });
  }

  if (opts.demoData !== false && process.env.SEED_DEMO_DATA !== 'false') {
    const dir = findSampleDir();
    if (!dir) {
      log('sample data folder not found — skipping demo data');
    } else if ((await prisma.stock.count({ where: { isDemo: true } })) > 0) {
      log('demo data already present');
    } else {
      const provider = new CsvProvider(dir);
      const stocks = await provider.getSymbols();
      for (const s of stocks) {
        const sector = s.sector ? await prisma.sector.upsert({ where: { name: s.sector }, create: { name: s.sector }, update: {} }) : null;
        const company = await prisma.company.create({ data: { name: s.companyName, sectorId: sector?.id } });
        const stock = await prisma.stock.create({ data: { symbol: s.symbol, companyId: company.id, isDemo: !!s.isDemo, dataSource: s.isDemo ? 'DEMO' : 'IMPORTED', status: s.status } });
        const candles = await provider.getHistoricalPrices(s.symbol, new Date(0), new Date('2100-01-01'), '1D');
        for (let i = 0; i < candles.length; i += 1000) {
          await prisma.dailyPrice.createMany({
            data: candles.slice(i, i + 1000).map((c) => ({ stockId: stock.id, date: c.date, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, turnover: c.turnover ?? null, source: s.isDemo ? 'DEMO' as const : 'IMPORTED' as const })),
            skipDuplicates: true,
          });
        }
        await recomputeDerivedFields(prisma, stock.id);
      }
      const n = await rebuildDerivedIndex(prisma);
      log(`DEMO DATA: ${stocks.length} synthetic stocks, derived index with ${n} points`);
    }
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  seed()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
