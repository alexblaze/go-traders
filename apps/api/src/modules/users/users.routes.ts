import type { Prisma } from '@nepse/database';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ok } from '../../lib/http';

export const UserSettingsSchema = z.object({
  defaultTimeframe: z.enum(['1M', '3M', '6M', '1Y', '3Y', '5Y', 'MAX']).default('1Y'),
  defaultStrategy: z.string().max(64).default('ensemble'),
  commissionOverride: z.number().min(0).max(0.1).nullable().default(null),
  slippageBps: z.number().min(0).max(500).default(10),
  signalThresholds: z.object({ minStrength: z.number().min(0).max(100).default(60) }).default({ minStrength: 60 }),
  notifications: z.object({ inApp: z.boolean().default(true), email: z.boolean().default(false) }).default({ inApp: true, email: false }),
  risk: z
    .object({
      maxPositionPct: z.number().min(1).max(100).default(20),
      maxExposurePct: z.number().min(1).max(100).default(80),
      stopLossPct: z.number().min(0.5).max(50).default(8),
      takeProfitPct: z.number().min(0.5).max(200).default(16),
      atrStopMultiple: z.number().min(0.5).max(10).default(2),
      riskRewardRatio: z.number().min(0.5).max(10).default(2),
    })
    .default({ maxPositionPct: 20, maxExposurePct: 80, stopLossPct: 8, takeProfitPct: 16, atrStopMultiple: 2, riskRewardRatio: 2 }),
  chart: z
    .object({ indicators: z.array(z.enum(['ema', 'sma', 'bb', 'vwap', 'rsi', 'macd', 'volume'])).default(['ema', 'volume']), showVolume: z.boolean().default(true) })
    .default({ indicators: ['ema', 'volume'], showVolume: true }),
});
export type UserSettings = z.infer<typeof UserSettingsSchema>;

export function parseSettings(raw: unknown): UserSettings {
  const r = UserSettingsSchema.safeParse(raw ?? {});
  return r.success ? r.data : UserSettingsSchema.parse({});
}

export default async function userRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = app.deps;
  const auth = { onRequest: [app.authenticate] };

  r.get('/me/settings', { ...auth, schema: { tags: ['users'], summary: 'Get user settings', security: [{ bearerAuth: [] }] } }, async (req) => {
    const u = await db.user.findUniqueOrThrow({ where: { id: req.user.sub } });
    return ok(parseSettings(u.settings));
  });

  r.put('/me/settings', { ...auth, schema: { tags: ['users'], summary: 'Update user settings', body: UserSettingsSchema.partial(), security: [{ bearerAuth: [] }] } }, async (req) => {
    const u = await db.user.findUniqueOrThrow({ where: { id: req.user.sub } });
    const merged = UserSettingsSchema.parse({ ...parseSettings(u.settings), ...req.body });
    await db.user.update({ where: { id: u.id }, data: { settings: merged as unknown as Prisma.InputJsonValue } });
    return ok(merged);
  });
}
