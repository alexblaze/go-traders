import { AppError, type ApiErrorBody } from '@nepse/shared';
import type { FastifyError, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { ZodError } from 'zod';

/** Consistent error envelope: { success:false, error:{code,message}, requestId }. */
export default fp(async function errors(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError | AppError | ZodError, req, reply) => {
    const body = (code: string, message: string, details?: unknown): ApiErrorBody => ({ success: false, error: { code, message, ...(details ? { details } : {}) }, requestId: req.id });

    if (err instanceof AppError) {
      if (err.statusCode >= 500) req.log.error({ err }, err.message);
      return reply.status(err.statusCode).send(body(err.code, err.message, err.details));
    }
    if (hasZodFastifySchemaValidationErrors(err)) {
      const details = err.validation.map((v) => ({ path: v.instancePath || ((v.params as { issue?: { path?: (string | number)[] } } | undefined)?.issue?.path ?? []).join('.'), message: v.message }));
      return reply.status(400).send(body('VALIDATION_ERROR', 'Request validation failed', details));
    }
    if (err instanceof ZodError) {
      return reply.status(400).send(body('VALIDATION_ERROR', 'Request validation failed', err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))));
    }
    const fe = err as FastifyError;
    if (fe.statusCode === 429) return reply.status(429).send(body('RATE_LIMITED', 'Too many requests, please slow down.'));
    if (fe.code?.startsWith('FST_JWT') || fe.statusCode === 401) return reply.status(401).send(body('UNAUTHORIZED', 'Authentication required or token invalid/expired.'));
    if (fe.code === 'FST_ERR_CTP_BODY_TOO_LARGE') return reply.status(413).send(body('VALIDATION_ERROR', 'Request body too large.'));
    if (fe.statusCode && fe.statusCode < 500) return reply.status(fe.statusCode).send(body('VALIDATION_ERROR', fe.message));
    req.log.error({ err }, 'Unhandled error');
    return reply.status(500).send(body('INTERNAL_ERROR', 'An unexpected error occurred.'));
  });

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.url} not found` }, requestId: req.id });
  });
});
