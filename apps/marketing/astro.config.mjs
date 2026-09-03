import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

const dashboard = fileURLToPath(new URL('../web/app/', import.meta.url));
const root = fileURLToPath(new URL('.', import.meta.url));

function sourceFor(pathname) {
  if (pathname === '/') return 'src/lib/content.ts';
  const feature = /^\/features\/([a-z0-9-]+)$/.exec(pathname);
  if (feature) return `src/lib/features/${feature[1]}.ts`;
  const comparison = /^\/compare\/([a-z0-9-]+)$/.exec(pathname);
  if (comparison) return `src/lib/compare/${comparison[1]}.ts`;
  if (pathname === '/pricing') return 'src/lib/pricing.ts';
  return `src/pages${pathname}.astro`;
}

function lastModified(url) {
  const file = sourceFor(new URL(url).pathname);
  try {
    return (
      execSync(`git log -1 --format=%cI -- ${file}`, { cwd: root, encoding: 'utf8' }).trim() || undefined
    );
  } catch {
    return undefined;
  }
}

export default defineConfig({
  site: 'https://buzzkit.dev',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  devToolbar: { enabled: false },
  integrations: [
    react(),
    sitemap({
      filter: (page) => !page.includes('/404'),
      serialize: (item) => {
        const lastmod = lastModified(item.url);
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    resolve: { alias: [{ find: /^@\/app\//, replacement: dashboard }] },
    ssr: { noExternal: [/^@visx\//, /^d3-/, '@number-flow/react', 'number-flow'] },
  },
});
