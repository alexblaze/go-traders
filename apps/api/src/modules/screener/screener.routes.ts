import type { Prisma } from '@nepse/database';
import { AppError } from '@nepse/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { IdParams, ok } from '../../lib/http';
import { PRESET_SCREENS, ScreenerService, ScreenSchema } from './screener.service';

export default async function screenerRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const svc = new ScreenerService(app.deps);
  const { db } = app.deps;
  const tags = ['screener'];
  const auth = { onRequest: [app.authenticate] };
  const security = [{ bearerAuth: [] }];

  r.post('/run', { schema: { tags, summary: 'Run a screen (filter builder DSL + quick filters)', body: ScreenSchema } }, async (req) => ok(await svc.run(req.body)));
  r.get('/presets', { schema: { tags, summary: 'Example screens' } }, async () => ok(PRESET_SCREENS));

  r.get('/saved', { ...auth, schema: { tags, summary: 'Your saved screens', security } }, async (req) =>
    ok(await db.savedScreen.findMany({ where: { userId: req.user.sub }, orderBy: { createdAt: 'desc' } })),
  );
  r.post('/saved', { ...auth, schema: { tags, summary: 'Save a screen', body: z.object({ name: z.string().min(1).max(80), definition: ScreenSchema }), security } }, async (req, reply) => {
    const row = await db.savedScreen.upsert({
      where: { userId_name: { userId: req.user.sub, name: req.body.name } },
      create: { userId: req.user.sub, name: req.body.name, definition: req.body.definition as unknown as Prisma.InputJsonValue },
      update: { definition: req.body.definition as unknown as Prisma.InputJsonValue },
    });
    reply.status(201);
    return ok(row);
  });
  r.delete('/saved/:id', { ...auth, schema: { tags, summary: 'Delete a saved screen', params: IdParams, security } }, async (req) => {
    const row = await db.savedScreen.findUnique({ where: { id: req.params.id } });
    if (!row || row.userId !== req.user.sub) throw new AppError('NOT_FOUND', 'Saved screen not found');
    await db.savedScreen.delete({ where: { id: row.id } });
    return ok({ deleted: true });
  });
}
