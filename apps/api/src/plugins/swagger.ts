import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

export default fp(async function docs(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'NEPSE Trading Signal & Research API',
        version: '0.1.0',
        description:
          'Decision-support and research API for the Nepal Stock Exchange. Signals are technical-analysis outputs, NOT financial advice, and do not guarantee future performance. Signal strength is an internal metric, not a probability.',
      },
      servers: [{ url: '/' }],
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
      tags: ['health', 'auth', 'users', 'stocks', 'market', 'strategies', 'signals', 'backtests', 'portfolio', 'watchlists', 'alerts', 'notifications', 'screener', 'analytics', 'ai', 'export', 'admin'].map((name) => ({ name })),
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs', uiConfig: { docExpansion: 'list', deepLinking: true } });
});
