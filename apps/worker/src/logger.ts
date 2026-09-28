import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'worker' },
  redact: { paths: ['*.password', '*.token', '*.apiKey', '*.SMTP_PASSWORD'], censor: '[REDACTED]' },
  ...(process.env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
});
