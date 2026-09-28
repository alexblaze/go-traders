import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

export default fp(async function security(app: FastifyInstance) {
  const { env, redis } = app.deps;
  await app.register(helmet, {
    // Swagger UI needs inline styles/scripts; everything else is JSON.
    contentSecurityPolicy: {
      directives: { defaultSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], scriptSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'validator.swagger.io'] },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  await app.register(cors, {
    origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    redis: env.NODE_ENV === 'test' ? undefined : redis,
    nameSpace: 'nepse:ratelimit:',
    skipOnError: true,
    // Per-user when authenticated (JWT sub), otherwise per-IP.
    keyGenerator: (req) => {
      const auth = req.headers.authorization;
      if (auth?.startsWith('Bearer ')) {
        try {
          const payload = JSON.parse(Buffer.from(auth.split('.')[1] ?? '', 'base64url').toString()) as { sub?: string };
          if (payload.sub) return `user:${payload.sub}`;
        } catch {
          /* fall through */
        }
      }
      return `ip:${req.ip}`;
    },
    allowList: (req) => req.url === '/health' || req.url === '/ready',
  });
});
