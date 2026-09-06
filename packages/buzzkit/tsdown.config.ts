import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/client/index.ts',
    'src/react/index.ts',
    'src/webhooks/index.ts',
    'src/expressions/index.ts',
    'src/workflows/index.ts',
    'src/sources/index.ts',
  ],
  format: 'esm',
  dts: true,
  clean: true,
  treeshake: true,
  external: ['react'],
});
