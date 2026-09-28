import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function createPrismaClient(url?: string): PrismaClient {
  return new PrismaClient({ ...(url ? { datasources: { db: { url } } } : {}), log: ['warn', 'error'] });
}

/** Process-wide singleton (avoids exhausting connections in dev hot-reload). */
export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export * from '@prisma/client';
