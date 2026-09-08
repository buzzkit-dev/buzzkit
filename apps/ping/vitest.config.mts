import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@buzzkit/ping': path.resolve(import.meta.dirname, './src'),
      'cloudflare:workers': path.resolve(import.meta.dirname, './test/utils/workers.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
