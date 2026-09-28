import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { IdParams, ok, pageMeta, PaginationQuery } from '../../lib/http';

export default async function notificationRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = app.deps;
  const tags = ['notifications'];
  const auth = { onRequest: [app.authenticate] };
  const security = [{ bearerAuth: [] }];

  r.get('', { ...auth, schema: { tags, summary: 'In-app notifications', querystring: PaginationQuery.extend({ unread: z.coerce.boolean().optional() }), security } }, async (req) => {
    const where = { userId: req.user.sub, channel: 'IN_APP' as const, ...(req.query.unread ? { readAt: null } : {}) };
    const [total, unread, rows] = await Promise.all([
      db.notification.count({ where }),
      db.notification.count({ where: { userId: req.user.sub, channel: 'IN_APP', readAt: null } }),
      db.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (req.query.page - 1) * req.query.pageSize, take: req.query.pageSize }),
    ]);
    return ok(rows, { ...pageMeta(req.query.page, req.query.pageSize, total), unread });
  });

  r.post('/:id/read', { ...auth, schema: { tags, summary: 'Mark as read', params: IdParams, security } }, async (req) => {
    await db.notification.updateMany({ where: { id: req.params.id, userId: req.user.sub }, data: { readAt: new Date() } });
    return ok({ read: true });
  });

  r.post('/read-all', { ...auth, schema: { tags, summary: 'Mark all as read', security } }, async (req) => {
    const r2 = await db.notification.updateMany({ where: { userId: req.user.sub, readAt: null }, data: { readAt: new Date() } });
    return ok({ updated: r2.count });
  });
}
