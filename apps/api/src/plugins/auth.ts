import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { AppError, type Role } from '@nepse/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

export interface JwtUser {
  sub: string;
  email: string;
  role: Role;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtUser;
    user: JwtUser;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(async function auth(app: FastifyInstance) {
  const { env } = app.deps;
  await app.register(cookie);
  await app.register(jwt, { secret: env.JWT_ACCESS_SECRET, sign: { expiresIn: env.JWT_ACCESS_TTL } });

  app.decorate('authenticate', async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch {
      throw new AppError('UNAUTHORIZED', 'Authentication required or token invalid/expired.');
    }
  });

  app.decorate('requireAdmin', async (req: FastifyRequest, reply: FastifyReply) => {
    await app.authenticate(req, reply);
    if (req.user.role !== 'ADMIN') throw new AppError('FORBIDDEN', 'Administrator role required.');
  });
});
