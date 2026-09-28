import type { Prisma, PrismaClient } from '@nepse/database';

export async function audit(db: PrismaClient, action: string, opts: { userId?: string | null; entity?: string; entityId?: string; metadata?: Record<string, unknown>; ip?: string } = {}) {
  try {
    await db.auditLog.create({
      data: { action, userId: opts.userId ?? null, entity: opts.entity, entityId: opts.entityId, metadata: (opts.metadata ?? undefined) as Prisma.InputJsonValue | undefined, ip: opts.ip },
    });
  } catch {
    /* audit must never break the request */
  }
}
