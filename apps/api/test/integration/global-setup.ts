import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { TestProject } from 'vitest/node';

const BASE = process.env.TEST_DATABASE_URL ?? 'postgresql://nepse:nepse@localhost:5432/nepse_test';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * Each run migrates a brand-new, uniquely named Postgres schema (non-destructive `migrate deploy`)
 * and seeds it. Teardown drops only the schema this run created.
 */
export default function setup(project: TestProject) {
  const schema = `test_run_${Date.now()}_${process.pid}`;
  const url = `${BASE}${BASE.includes('?') ? '&' : '?'}schema=${schema}`;
  const root = resolve(__dirname, '../../../..');
  const env = { ...process.env, DATABASE_URL: url, ADMIN_EMAIL: 'admin@test.local', ADMIN_PASSWORD: 'AdminPass123', SEED_DATA_DIR: resolve(root, 'data/sample') };
  const cwd = resolve(root, 'packages/database');
  execSync('npx prisma migrate deploy', { cwd, env, stdio: 'pipe' });
  execSync('npx tsx src/seed.ts', { cwd, env, stdio: 'pipe' });
  project.provide('databaseUrl', url);

  return () => {
    if (!/^test_run_\d+_\d+$/.test(schema)) return;
    execSync(`npx prisma db execute --stdin --url "${BASE}"`, { cwd, env, input: `DROP SCHEMA IF EXISTS "${schema}" CASCADE;`, stdio: 'pipe' });
  };
}
