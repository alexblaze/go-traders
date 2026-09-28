import type { PrismaClient } from '@prisma/client';

export const DERIVED_INDEX_NAME = 'Derived Equal-Weight Index';

/**
 * Builds an equal-weight composite from stored daily prices (base 1000 at the first date).
 * It is clearly flagged `isDerived` — it is NOT the official NEPSE index. If an official index
 * series is imported (name "NEPSE"), the UI prefers that.
 */
export async function rebuildDerivedIndex(db: PrismaClient): Promise<number> {
  const rows = await db.$queryRaw<{ date: Date; avg_ret: number | null; adv: bigint; dec: bigint; unch: bigint; turnover: number | null; volume: number | null }[]>`
    SELECT date,
           AVG(change_percent) AS avg_ret,
           COUNT(*) FILTER (WHERE change > 0) AS adv,
           COUNT(*) FILTER (WHERE change < 0) AS dec,
           COUNT(*) FILTER (WHERE change = 0 OR change IS NULL) AS unch,
           SUM(turnover) AS turnover,
           SUM(volume) AS volume
    FROM daily_prices
    GROUP BY date
    ORDER BY date ASC`;
  let value = 1000;
  let prev: number | null = null;
  const data = rows.map((r, i) => {
    if (i > 0 && r.avg_ret !== null) value = value * (1 + Number(r.avg_ret) / 100);
    const change = prev !== null ? value - prev : null;
    const out = {
      name: DERIVED_INDEX_NAME, date: r.date, value: Math.round(value * 100) / 100,
      change: change !== null ? Math.round(change * 100) / 100 : null,
      changePercent: prev ? Math.round(((value - prev) / prev) * 10000) / 100 : null,
      turnover: r.turnover !== null ? Number(r.turnover) : null, volume: r.volume !== null ? Number(r.volume) : null,
      advancers: Number(r.adv), decliners: Number(r.dec), unchanged: Number(r.unch), isDerived: true,
    };
    prev = value;
    return out;
  });
  await db.marketIndex.deleteMany({ where: { name: DERIVED_INDEX_NAME } });
  for (let i = 0; i < data.length; i += 1000) await db.marketIndex.createMany({ data: data.slice(i, i + 1000) });
  return data.length;
}
