import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, loginAdmin, registerUser, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => (ctx = await createTestApp()));
afterAll(async () => ctx.close());

describe('authentication', () => {
  it('registers, logs in and returns the current user', async () => {
    const u = await registerUser(ctx.app);
    const me = await ctx.app.inject({ url: '/api/v1/auth/me', headers: bearer(u.token) });
    expect(me.statusCode).toBe(200);
    expect(me.json().data).toMatchObject({ email: u.email, role: 'USER' });
    const login = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: u.email, password: 'Password123' } });
    expect(login.statusCode).toBe(200);
    expect(login.headers['set-cookie']).toMatch(/nepse_rt=.*HttpOnly.*SameSite=Strict/i);
  });

  it('rejects weak passwords and duplicate emails with the error envelope', async () => {
    const weak = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: 'weak@test.local', password: 'short' } });
    expect(weak.statusCode).toBe(400);
    expect(weak.json()).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    expect(weak.json().requestId).toBeTruthy();
    const u = await registerUser(ctx.app);
    const dup = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: u.email, password: 'Password123' } });
    expect(dup.statusCode).toBe(409);
  });

  it('rejects bad credentials without revealing which part was wrong', async () => {
    const r = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'nobody@test.local', password: 'Password123' } });
    expect(r.statusCode).toBe(401);
    expect(r.json().error.message).toBe('Invalid email or password.');
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const u = await registerUser(ctx.app);
    const r1 = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: u.refreshToken } });
    expect(r1.statusCode).toBe(200);
    const next = r1.json().data.refreshToken;
    expect(next).not.toBe(u.refreshToken);
    const reuse = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: u.refreshToken } });
    expect(reuse.statusCode).toBe(401);
    // The whole family is revoked after reuse.
    const after = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: next } });
    expect(after.statusCode).toBe(401);
  });

  it('logout revokes the refresh token', async () => {
    const u = await registerUser(ctx.app);
    await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/logout', payload: { refreshToken: u.refreshToken } });
    const r = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: u.refreshToken } });
    expect(r.statusCode).toBe(401);
  });

  it('protects endpoints and enforces roles', async () => {
    expect((await ctx.app.inject({ url: '/api/v1/portfolio' })).statusCode).toBe(401);
    expect((await ctx.app.inject({ url: '/api/v1/portfolio', headers: bearer('garbage') })).json().error.code).toBe('UNAUTHORIZED');
    const u = await registerUser(ctx.app);
    expect((await ctx.app.inject({ url: '/api/v1/admin/health', headers: bearer(u.token) })).statusCode).toBe(403);
    const admin = await loginAdmin(ctx.app);
    expect((await ctx.app.inject({ url: '/api/v1/admin/health', headers: bearer(admin) })).statusCode).toBe(200);
  });

  it('sets security headers and request ids', async () => {
    const r = await ctx.app.inject({ url: '/health' });
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-request-id']).toBeTruthy();
  });
});
