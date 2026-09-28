import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Bundle workspace packages (TypeScript sources); keep npm deps external.
  noExternal: [/^@nepse\//],
  external: ['@prisma/client', '.prisma/client'],
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});
