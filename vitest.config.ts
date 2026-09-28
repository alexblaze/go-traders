import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/test/**/*.test.ts', 'apps/*/test/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['apps/*/test/integration/**/*.test.ts'],
          environment: 'node',
          fileParallelism: false,
          globalSetup: ['apps/api/test/integration/global-setup.ts'],
          setupFiles: ['apps/api/test/integration/setup-env.ts'],
          testTimeout: 30000,
          hookTimeout: 60000,
        },
      },
    ],
  },
});
