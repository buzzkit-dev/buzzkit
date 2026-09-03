import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { comparisons } from '../../../src/lib/compare';
import { features } from '../../../src/lib/features';
import { site } from '../../../src/lib/site';

const PUBLIC = join(process.cwd(), 'public');

const GENERATED = [
  '/index.md',
  '/pricing.md',
  '/llms.txt',
  '/llms-full.txt',
  '/features/llms.txt',
  '/compare/llms.txt',
  '/developers/llms.txt',
  '/.well-known/agent-skills/index.json',
  ...features.map((feature) => `/features/${feature.slug}.md`),
  ...comparisons.map((comparison) => `/compare/${comparison.slug}.md`),
];

function listPublicPaths(directory = PUBLIC, prefix = ''): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return listPublicPaths(path, `${prefix}/${name}`);
    return [`${prefix}/${name}`];
  });
}

export function listSitePaths(text: string): string[] {
  const matches = text.matchAll(new RegExp(`${site.url.replaceAll('.', '\\.')}(/[^\\s)>]*)`, 'g'));
  return [...new Set([...matches].map((match) => match[1]!))];
}

export function resolvesOnSite(path: string): boolean {
  if (GENERATED.includes(path)) return true;
  if (path === '/') return true;
  return existsSync(join(PUBLIC, path)) && listPublicPaths().includes(path);
}
