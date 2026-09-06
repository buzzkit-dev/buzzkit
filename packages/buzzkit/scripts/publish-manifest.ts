import { readFileSync, writeFileSync } from 'node:fs';

type Manifest = {
  exports: Record<string, { types: string; default: string }>;
  files: string[];
};

const MANIFEST_PATH = new URL('../package.json', import.meta.url);

function published(entry: { types: string }): { types: string; default: string } {
  const built = entry.types.replace(/^\.\/src\//, './dist/').replace(/\.ts$/, '');
  return { types: `${built}.d.mts`, default: `${built}.mjs` };
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;

manifest.exports = Object.fromEntries(
  Object.entries(manifest.exports).map(([name, entry]) => [name, published(entry)])
);
manifest.files = ['dist'];

writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`rewrote ${Object.keys(manifest.exports).length} entry points to the built output\n`);
