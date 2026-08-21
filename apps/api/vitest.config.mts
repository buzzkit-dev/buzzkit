import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Integration tests: plain Node pool making HTTP requests against a running
// dev server (`bun dev`, port 8790), with direct database access for seeding.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@buzzkit/api': path.resolve(import.meta.dirname, './src'),
      'cloudflare:workers': path.resolve(import.meta.dirname, './test/utils/cloudflareWorkersStub.ts'),
      '@buzzkit/database': path.resolve(import.meta.dirname, '../../packages/database/src/index.ts'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    server: {
      deps: {
        inline: [/otel-cf-workers/, /@buzzkit\/observability/],
      },
    },
  },
});
