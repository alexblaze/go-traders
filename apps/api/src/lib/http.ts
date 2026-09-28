import { z } from 'zod';

export function ok<T>(data: T, meta?: Record<string, unknown>) {
  return { success: true as const, data, ...(meta ? { meta } : {}) };
}

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export function pageMeta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

export const SymbolParams = z.object({ symbol: z.string().min(1).max(20).regex(/^[A-Za-z0-9]+$/).transform((s) => s.toUpperCase()) });
export const IdParams = z.object({ id: z.string().min(1).max(64) });

/** Replace non-finite numbers with null for JSON. */
export function finite<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : typeof v === 'bigint' ? Number(v) : v)));
}
