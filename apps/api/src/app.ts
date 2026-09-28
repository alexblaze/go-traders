import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { AppDeps } from './lib/context';
import adminRoutes from './modules/admin/admin.routes';
import aiRoutes from './modules/ai/ai.routes';
import alertRoutes from './modules/alerts/alerts.routes';
import analyticsRoutes from './modules/analytics/analytics.routes';
import authRoutes from './modules/auth/auth.routes';
import backtestRoutes from './modules/backtests/backtests.routes';
import exportRoutes from './modules/export/export.routes';
import healthRoutes from './modules/health/health.routes';
import marketRoutes from './modules/market/market.routes';
import notificationRoutes from './modules/notifications/notifications.routes';
import portfolioRoutes from './modules/portfolio/portfolio.routes';
import screenerRoutes from './modules/screener/screener.routes';
import signalRoutes from './modules/signals/signals.routes';
import stockRoutes from './modules/stocks/stocks.routes';
import strategyRoutes from './modules/strategies/strategies.routes';
import userRoutes from './modules/users/users.routes';
import watchlistRoutes from './modules/watchlists/watchlists.routes';
import authPlugin from './plugins/auth';
import errorsPlugin from './plugins/errors';
import observability from './plugins/observability';
import security from './plugins/security';
import swagger from './plugins/swagger';

/** Sensitive values that must never be written to logs. */
export const REDACT_PATHS = [
  'req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]',
  'body.password', 'body.refreshToken', 'body.accessToken', '*.password', '*.passwordHash', '*.token', '*.apiKey',
];

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.env.LOG_LEVEL === 'silent' ? false : {
      level: deps.env.LOG_LEVEL,
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
      ...(deps.env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:standard' } } } : {}),
    },
    genReqId: (req) => {
      const h = req.headers['x-request-id'];
      return typeof h === 'string' && /^[\w-]{8,64}$/.test(h) ? h : randomUUID();
    },
    disableRequestLogging: true,
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
  });
  app.decorate('deps', deps);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  // Serialise BigInt safely (Prisma aggregates).
  app.setReplySerializer((payload) => JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)));

  await app.register(errorsPlugin);
  await app.register(observability);
  await app.register(security);
  await app.register(authPlugin);
  await app.register(swagger);

  await app.register(healthRoutes);
  await app.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(userRoutes, { prefix: '/users' });
      await api.register(stockRoutes, { prefix: '/stocks' });
      await api.register(marketRoutes, { prefix: '/market' });
      await api.register(strategyRoutes, { prefix: '/strategies' });
      await api.register(signalRoutes, { prefix: '/signals' });
      await api.register(backtestRoutes, { prefix: '/backtests' });
      await api.register(portfolioRoutes, { prefix: '/portfolio' });
      await api.register(watchlistRoutes, { prefix: '/watchlists' });
      await api.register(alertRoutes, { prefix: '/alerts' });
      await api.register(notificationRoutes, { prefix: '/notifications' });
      await api.register(screenerRoutes, { prefix: '/screener' });
      await api.register(analyticsRoutes, { prefix: '/analytics' });
      await api.register(exportRoutes, { prefix: '/export' });
      await api.register(aiRoutes, { prefix: '/ai' });
      await api.register(adminRoutes, { prefix: '/admin' });
    },
    { prefix: '/api/v1' },
  );
  return app;
}
