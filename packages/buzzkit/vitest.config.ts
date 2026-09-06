import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          include: ['test/**/*.test.ts'],
          exclude: ['test/react/**'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'react',
          include: ['test/react/**/*.test.tsx'],
          environment: 'jsdom',
        },
      },
    ],
    coverage: {
      include: ['src/**'],
      exclude: ['src/**/index.ts'],
      reporter: ['text-summary'],
      thresholds: { statements: 98, branches: 95, functions: 100, lines: 98 },
    },
  },
});
