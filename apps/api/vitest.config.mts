import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Integration tests: plain Node pool making HTTP requests against a running
// dev server (`bun dev`, port 8790), with direct database access for seeding.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@buzzkit/database': path.resolve(import.meta.dirname, '../../packages/database/src/index.ts'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 10000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
