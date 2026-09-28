import { DEFAULT_JOB_OPTIONS, QUEUE_NAMES, type QueueName } from '@nepse/config';
import { Queue, type JobsOptions } from 'bullmq';
import type { Redis } from 'ioredis';

export type Queues = Record<QueueName, Queue> & { close(): Promise<void> };

export function createQueues(connection: Redis): Queues {
  const out = {} as Record<QueueName, Queue>;
  for (const name of Object.values(QUEUE_NAMES)) {
    out[name] = new Queue(name, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
  }
  return Object.assign(out, {
    async close() {
      await Promise.all(Object.values(QUEUE_NAMES).map((n) => out[n].close()));
    },
  });
}

export async function enqueue(queues: Queues, name: QueueName, jobName: string, data: Record<string, unknown>, opts?: JobsOptions): Promise<string> {
  const job = await queues[name].add(jobName, data, opts);
  return job.id ?? '';
}
