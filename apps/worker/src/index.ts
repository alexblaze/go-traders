import { DEFAULT_JOB_OPTIONS, loadEnv, QUEUE_NAMES, type QueueName } from '@nepse/config';
import { analyzeStock, commitImport, executeBacktest, prisma, type Prisma } from '@nepse/database';
import { createProvider } from '@nepse/market-data';
import { Queue, Worker, type Job, type Processor } from 'bullmq';
import { Redis } from 'ioredis';
import { logger } from './logger';
import { NotificationService } from './notify';
import { evaluateAlerts } from './processors/alerts';
import { dailyScan } from './processors/screener';
import { generateAll, signalPerformance } from './processors/signals';
import { syncMarketData } from './processors/sync';

const env = loadEnv();
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const provider = createProvider(env);
const notifications = new NotificationService(prisma, env);
const queues = Object.fromEntries(Object.values(QUEUE_NAMES).map((n) => [n, new Queue(n, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS })])) as Record<QueueName, Queue>;

/** Wraps a processor with job_runs tracking and structured logging (jobId, queue, duration, status). */
function tracked(queue: QueueName, fn: Processor): Processor {
  return async (job: Job) => {
    const started = Date.now();
    const jobId = job.id ?? 'unknown';
    const log = logger.child({ queue, jobId, job: job.name, symbol: job.data?.symbol, strategy: job.data?.strategy });
    const data = JSON.parse(JSON.stringify(job.data ?? {})) as Prisma.InputJsonValue;
    await prisma.jobRun.upsert({
      where: { queue_jobId: { queue, jobId } },
      create: { queue, jobId, name: job.name, status: 'RUNNING', attempts: job.attemptsMade + 1, data },
      update: { status: 'RUNNING', attempts: job.attemptsMade + 1, startedAt: new Date(), error: null },
    }).catch(() => undefined);
    log.info({ status: 'started', attempt: job.attemptsMade + 1 }, 'job started');
    try {
      const result = await fn(job);
      const durationMs = Date.now() - started;
      await prisma.jobRun.update({ where: { queue_jobId: { queue, jobId } }, data: { status: 'COMPLETED', progress: 100, finishedAt: new Date(), durationMs, result: JSON.parse(JSON.stringify(result ?? null)) } }).catch(() => undefined);
      log.info({ status: 'completed', durationMs }, 'job completed');
      return result;
    } catch (e) {
      const durationMs = Date.now() - started;
      await prisma.jobRun.update({ where: { queue_jobId: { queue, jobId } }, data: { status: 'FAILED', finishedAt: new Date(), durationMs, error: (e as Error).message } }).catch(() => undefined);
      log.error({ status: 'failed', durationMs, err: (e as Error).message }, 'job failed');
      throw e;
    }
  };
}

const processors: Record<QueueName, Processor> = {
  [QUEUE_NAMES.marketDataSync]: async (job) => {
    const r = await syncMarketData(prisma, provider, job);
    await queues[QUEUE_NAMES.signalGeneration].add('generate-all', { reason: 'sync' });
    return r;
  },
  [QUEUE_NAMES.indicatorCalculation]: async (job) => {
    const stock = await prisma.stock.findUniqueOrThrow({ where: { symbol: job.data.symbol } });
    const r = await analyzeStock(prisma, stock, { persist: true });
    return { symbol: r.symbol, date: r.date, signals: r.signals.length };
  },
  [QUEUE_NAMES.signalGeneration]: async (job) => {
    if (job.name === 'signal-performance') return signalPerformance(prisma, job);
    const r = await generateAll(prisma, job);
    await queues[QUEUE_NAMES.alerts].add('evaluate', { reason: 'post-signals' });
    return r;
  },
  [QUEUE_NAMES.backtesting]: async (job) => {
    await executeBacktest(prisma, job.data.backtestId, async (p) => {
      await job.updateProgress(p);
      await prisma.backtest.update({ where: { id: job.data.backtestId }, data: { progress: p } });
    });
    return { backtestId: job.data.backtestId };
  },
  [QUEUE_NAMES.marketScreener]: async (job) => dailyScan(prisma, job),
  [QUEUE_NAMES.alerts]: async (job) => {
    const r = await evaluateAlerts(prisma, job);
    for (const id of r.toDeliver) await queues[QUEUE_NAMES.notifications].add('deliver', { notificationId: id });
    return { evaluated: r.evaluated, triggered: r.triggered, queuedDeliveries: r.toDeliver.length };
  },
  [QUEUE_NAMES.notifications]: async (job) => {
    await notifications.deliver(job.data.notificationId);
    return { delivered: job.data.notificationId };
  },
  [QUEUE_NAMES.csvImport]: async (job) => {
    const r = await commitImport(prisma, job.data.importId, (p) => job.updateProgress(p));
    await queues[QUEUE_NAMES.signalGeneration].add('generate-all', { reason: 'import', importId: job.data.importId });
    return r;
  },
};

const concurrency: Partial<Record<QueueName, number>> = { [QUEUE_NAMES.signalGeneration]: 1, [QUEUE_NAMES.csvImport]: 1, [QUEUE_NAMES.marketDataSync]: 1 };
const workers = Object.values(QUEUE_NAMES).map(
  (q) => new Worker(q, tracked(q, processors[q]), { connection, concurrency: concurrency[q] ?? env.WORKER_CONCURRENCY }),
);
workers.forEach((w) => w.on('error', (err) => logger.error({ queue: w.name, err: err.message }, 'worker error')));

async function schedule() {
  const tz = 'Asia/Kathmandu';
  await queues[QUEUE_NAMES.signalGeneration].upsertJobScheduler('daily-signals', { pattern: env.SIGNAL_CRON, tz }, { name: 'generate-all', data: { reason: 'schedule' } });
  await queues[QUEUE_NAMES.alerts].upsertJobScheduler('alert-evaluation', { pattern: env.ALERT_CRON, tz }, { name: 'evaluate', data: { reason: 'schedule' } });
  await queues[QUEUE_NAMES.marketScreener].upsertJobScheduler('daily-scan', { pattern: '30 16 * * 0-4', tz }, { name: 'daily-scan', data: {} });
  await queues[QUEUE_NAMES.signalGeneration].upsertJobScheduler('weekly-signal-performance', { pattern: '0 6 * * 6', tz }, { name: 'signal-performance', data: {} });
  if (env.MARKET_DATA_PROVIDER !== 'csv') {
    await queues[QUEUE_NAMES.marketDataSync].upsertJobScheduler('daily-sync', { pattern: '15 15 * * 0-4', tz }, { name: 'sync', data: { days: 5 } });
  }
  // Warm start: make sure signals exist for the latest data.
  await queues[QUEUE_NAMES.signalGeneration].add('generate-all', { reason: 'startup' }, { jobId: `startup-${new Date().toISOString().slice(0, 13)}` });
}

schedule()
  .then(() => logger.info({ queues: Object.values(QUEUE_NAMES), provider: provider.name }, 'worker started'))
  .catch((e) => logger.error({ err: e.message }, 'scheduler setup failed'));

async function shutdown(signal: string) {
  logger.info({ signal }, 'worker shutting down');
  await Promise.all(workers.map((w) => w.close()));
  await Promise.all(Object.values(queues).map((q) => q.close()));
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
