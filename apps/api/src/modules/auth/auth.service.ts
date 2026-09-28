import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@nepse/database';
import { AppError, type Role } from '@nepse/shared';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';

const BCRYPT_ROUNDS = 12;
// Hash used to equalise timing when the email does not exist (computed once, lazily).
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hash(randomBytes(16).toString('hex'), BCRYPT_ROUNDS));

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: { id: string; email: string; name: string | null; role: Role };
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export class AuthService {
  constructor(private readonly app: FastifyInstance, private readonly db: PrismaClient, private readonly refreshTtlDays: number) {}

  async register(email: string, password: string, name?: string, meta: SessionMeta = {}): Promise<IssuedTokens> {
    const normalized = email.trim().toLowerCase();
    if (await this.db.user.findUnique({ where: { email: normalized } })) throw new AppError('CONFLICT', 'An account with this email already exists.');
    const role = await this.db.role.upsert({ where: { name: 'USER' }, create: { name: 'USER' }, update: {} });
    const user = await this.db.user.create({
      data: { email: normalized, passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS), name: name ?? null, roleId: role.id },
      include: { role: true },
    });
    return this.issue({ id: user.id, email: user.email, name: user.name, role: user.role.name as Role }, randomUUID(), meta);
  }

  async login(email: string, password: string, meta: SessionMeta = {}): Promise<IssuedTokens> {
    const user = await this.db.user.findUnique({ where: { email: email.trim().toLowerCase() }, include: { role: true } });
    const valid = await bcrypt.compare(password, user?.passwordHash ?? (await getDummyHash()));
    if (!user || !valid) throw new AppError('UNAUTHORIZED', 'Invalid email or password.');
    await this.db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issue({ id: user.id, email: user.email, name: user.name, role: user.role.name as Role }, randomUUID(), meta);
  }

  /** Rotate a refresh token. Reuse of a revoked token revokes the whole token family. */
  async refresh(token: string, meta: SessionMeta = {}): Promise<IssuedTokens> {
    const row = await this.db.refreshToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: { include: { role: true } } } });
    if (!row) throw new AppError('UNAUTHORIZED', 'Invalid refresh token.');
    if (row.revokedAt) {
      await this.db.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw new AppError('UNAUTHORIZED', 'Refresh token reuse detected; please log in again.');
    }
    if (row.expiresAt.getTime() < Date.now()) throw new AppError('UNAUTHORIZED', 'Refresh token expired.');
    const issued = await this.issue({ id: row.user.id, email: row.user.email, name: row.user.name, role: row.user.role.name as Role }, row.familyId, meta);
    const newRow = await this.db.refreshToken.findUnique({ where: { tokenHash: sha256(issued.refreshToken) } });
    await this.db.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date(), replacedById: newRow?.id } });
    return issued;
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    const row = await this.db.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (row) await this.db.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async me(userId: string) {
    const u = await this.db.user.findUnique({ where: { id: userId }, include: { role: true } });
    if (!u) throw new AppError('UNAUTHORIZED', 'User no longer exists.');
    return { id: u.id, email: u.email, name: u.name, role: u.role.name as Role, createdAt: u.createdAt };
  }

  private async issue(user: IssuedTokens['user'], familyId: string, meta: SessionMeta): Promise<IssuedTokens> {
    const accessToken = this.app.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlDays * 86400000);
    await this.db.refreshToken.create({
      data: { userId: user.id, tokenHash: sha256(refreshToken), familyId, expiresAt: refreshExpiresAt, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 255) },
    });
    return { accessToken, refreshToken, refreshExpiresAt, user };
  }
}
