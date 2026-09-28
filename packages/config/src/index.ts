import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

/**
 * Single source of truth for runtime configuration.
 * Secrets have no defaults outside of development/test.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(14),
  COOKIE_SECURE: bool.default(false),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),

  MARKET_DATA_PROVIDER: z.enum(['csv', 'mock', 'nepse']).default('csv'),
  MARKET_DATA_CSV_DIR: z.string().default('./data/sample'),
  NEPSE_API_BASE_URL: z.string().optional(),
  NEPSE_API_KEY: z.string().optional(),
  NEPSE_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(30),

  AI_PROVIDER: z.enum(['anthropic', 'template']).default('template'),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-sonnet-5-5'),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('alerts@nepse-platform.local'),

  LIVE_TRADING_ENABLED: bool.default(false),

  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(4),
  SIGNAL_CRON: z.string().default('0 11 * * 0-4'),
  ALERT_CRON: z.string().default('*/5 * * * *'),

  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  if (cached && source === process.env) return cached;
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.JWT_ACCESS_SECRET.includes('change-me')) {
    throw new Error('JWT_ACCESS_SECRET must be changed in production');
  }
  if (source === process.env) cached = parsed.data;
  return parsed.data;
}

export function resetEnvCache(): void {
  cached = undefined;
}

export const QUEUE_NAMES = {
  marketDataSync: 'market-data-sync',
  indicatorCalculation: 'indicator-calculation',
  signalGeneration: 'signal-generation',
  backtesting: 'backtesting',
  marketScreener: 'market-screener',
  alerts: 'alerts',
  notifications: 'notifications',
  csvImport: 'csv-import',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: { count: 500, age: 7 * 24 * 3600 },
  removeOnFail: { count: 1000 },
};
