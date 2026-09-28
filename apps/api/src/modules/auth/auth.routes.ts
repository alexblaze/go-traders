import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { ok } from '../../lib/http';
import { AuthService, type IssuedTokens } from './auth.service';

export const REFRESH_COOKIE = 'nepse_rt';

const Password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a digit');

const RegisterBody = z.object({ email: z.string().email().max(254), password: Password, name: z.string().min(1).max(100).optional() });
const LoginBody = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(128) });
const RefreshBody = z.object({ refreshToken: z.string().min(10).max(200).optional() }).optional();

export default async function authRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db, env } = app.deps;
  const svc = new AuthService(app, db, env.REFRESH_TOKEN_TTL_DAYS);
  // Stricter limit for credential endpoints (brute-force protection).
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };
  // Refresh runs on every full page load, so it gets a separate, looser limit.
  const refreshLimit = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } };

  const respond = (reply: FastifyReply, t: IssuedTokens) => {
    reply.setCookie(REFRESH_COOKIE, t.refreshToken, {
      httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'strict', path: '/api/v1/auth', expires: t.refreshExpiresAt,
    });
    // Refresh token is ALSO returned for non-browser clients; browsers should rely on the httpOnly cookie.
    return ok({ accessToken: t.accessToken, refreshToken: t.refreshToken, tokenType: 'Bearer', expiresIn: env.JWT_ACCESS_TTL, user: t.user });
  };
  const meta = (req: { ip: string; headers: Record<string, unknown> }) => ({ ip: req.ip, userAgent: String(req.headers['user-agent'] ?? '') });

  r.post('/register', { ...strict, schema: { tags: ['auth'], summary: 'Create an account', body: RegisterBody } }, async (req, reply) => {
    const t = await svc.register(req.body.email, req.body.password, req.body.name, meta(req));
    await audit(db, 'auth.register', { userId: t.user.id, ip: req.ip });
    reply.status(201);
    return respond(reply, t);
  });

  r.post('/login', { ...strict, schema: { tags: ['auth'], summary: 'Log in with email/password', body: LoginBody } }, async (req, reply) => {
    try {
      const t = await svc.login(req.body.email, req.body.password, meta(req));
      await audit(db, 'auth.login', { userId: t.user.id, ip: req.ip });
      return respond(reply, t);
    } catch (e) {
      await audit(db, 'auth.login_failed', { ip: req.ip, metadata: { email: req.body.email.toLowerCase() } });
      throw e;
    }
  });

  r.post('/refresh', { ...refreshLimit, schema: { tags: ['auth'], summary: 'Rotate refresh token and get a new access token', body: RefreshBody } }, async (req, reply) => {
    const token = req.cookies[REFRESH_COOKIE] ?? req.body?.refreshToken;
    if (!token) {
      reply.status(401);
      return { success: false, error: { code: 'UNAUTHORIZED', message: 'Missing refresh token.' }, requestId: req.id };
    }
    return respond(reply, await svc.refresh(token, meta(req)));
  });

  r.post('/logout', { schema: { tags: ['auth'], summary: 'Revoke refresh token family', body: RefreshBody } }, async (req, reply) => {
    await svc.logout(req.cookies[REFRESH_COOKIE] ?? req.body?.refreshToken);
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    return ok({ loggedOut: true });
  });

  r.get('/me', { onRequest: [app.authenticate], schema: { tags: ['auth'], summary: 'Current user', security: [{ bearerAuth: [] }] } }, async (req) => ok(await svc.me(req.user.sub)));
}
