import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { observeLatency } from '../lib/metrics';

/** Structured request logging (requestId, userId, route, status, duration) and latency metrics. */
export default fp(async function observability(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });
  app.addHook('onResponse', async (req, reply) => {
    const duration = reply.elapsedTime;
    const route = req.routeOptions.url ?? 'unknown';
    observeLatency(route, req.method, reply.statusCode, duration);
    req.log.info(
      { requestId: req.id, userId: (req.user as { sub?: string } | undefined)?.sub, method: req.method, route, status: reply.statusCode, durationMs: Math.round(duration) },
      'request completed',
    );
  });
});
