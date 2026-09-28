/**
 * Generates the SYNTHETIC demo dataset in data/sample (clearly labelled DEMO DATA).
 * Usage: pnpm tsx scripts/generate-demo-data.ts [outDir]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEMO_UNIVERSE, generateSyntheticCandles, toPriceCsv } from '@nepse/market-data';

const outDir = process.argv[2] ?? join(process.cwd(), 'data/sample');
const range = { from: new Date('2023-09-01T00:00:00Z'), to: new Date('2026-09-24T00:00:00Z') };
mkdirSync(outDir, { recursive: true });

const stockLines = ['symbol,companyName,sector,subSector,listedDate,sharesOutstanding,paidUpCapital,status,isDemo'];
for (const s of DEMO_UNIVERSE) stockLines.push(`${s.symbol},"${s.companyName}",${s.sector},,,,,ACTIVE,true`);
writeFileSync(join(outDir, 'stocks.csv'), stockLines.join('\n') + '\n');

const rows = DEMO_UNIVERSE.flatMap((s) => generateSyntheticCandles(s, range).map((c) => ({ symbol: s.symbol, ...c })));
writeFileSync(join(outDir, 'prices.csv'), toPriceCsv(rows));
console.log(`DEMO DATA written to ${outDir}: ${DEMO_UNIVERSE.length} stocks, ${rows.length} candles`);
