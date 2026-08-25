/**
 * Pre-renders the Central Icons we actually use into `src/components/icon/paths.ts`.
 *
 * Scans apps/ and packages/ for `name='Icon…'` / `icon='Icon…'` usages so the
 * shipped bundle carries only referenced icons. Runs automatically before
 * dev/build/check-types via turbo.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CentralIcon } from '@central-icons-react/all';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CUSTOM_ICON_PATHS } from '../src/components/icon/custom';

const ROOT = resolve(import.meta.dirname, '../../..');
const SCAN_ROOTS = ['apps', 'packages'].map((d) => resolve(ROOT, d));
const OUT = resolve(import.meta.dirname, '../src/components/icon/paths.ts');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.turbo', '.react-router', '.wrangler']);

const VALID_RADII = new Set(['0', '1', '2', '3']);
const DEFAULT_RADIUS = '3';
const NAME_ATTR_RE = /(?:name|icon)\s*=\s*["'](Icon[A-Z][A-Za-z0-9]*)["']/g;
const NAME_PROP_RE = /\b(?:name|icon)\s*:\s*["'](Icon[A-Z][A-Za-z0-9]*)["']/g;
const RADIUS_IN_TAG_RE = /\bradius\s*=\s*["']([^"']+)["']/g;
const TAG_RE = /<[A-Za-z][A-Za-z0-9]*\b[^<>]*\/?>/g;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(tsx?|jsx?|mdx)$/.test(entry)) yield path;
  }
}

type Discovered = Map<string, Set<string>>;

function discover(): Discovered {
  const found: Discovered = new Map();
  const note = (name: string, radius: string) => {
    const set = found.get(name) ?? new Set<string>([DEFAULT_RADIUS]);
    set.add(radius);
    found.set(name, set);
  };
  for (const root of SCAN_ROOTS) {
    for (const file of walk(root)) {
      if (file === OUT) continue;
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(NAME_ATTR_RE)) note(m[1]!, DEFAULT_RADIUS);
      for (const m of src.matchAll(NAME_PROP_RE)) note(m[1]!, DEFAULT_RADIUS);
      for (const tag of src.match(TAG_RE) ?? []) {
        const radii = [...tag.matchAll(RADIUS_IN_TAG_RE)].map((m) => m[1]!).filter((r) => VALID_RADII.has(r));
        if (radii.length === 0) continue;
        for (const name of [...tag.matchAll(NAME_ATTR_RE)].map((m) => m[1]!)) {
          for (const radius of radii) note(name, radius);
        }
      }
    }
  }
  return found;
}

/**
 * Per-icon stroke tweaks, applied to the rendered markup — the catalog only
 * ships 1 / 1.5 / 2. The checkmark's 2 reads too thin at small sizes.
 */
const STROKE_OVERRIDES: Record<string, string> = {
  IconCheckmark1: '2.5',
};

const OPTICAL_SCALE: Record<string, number> = {
  IconPaperPlaneTopRight: 0.9,
  IconPaperPlaneTopRightFilled: 0.9,
};

function renderIconPath(name: string, radius: string): string {
  const custom = CUSTOM_ICON_PATHS[name];
  if (custom) return custom;
  const filled = name.endsWith('Filled');
  const centralName = filled ? name.slice(0, -'Filled'.length) : name;
  const html = renderToStaticMarkup(
    createElement(CentralIcon, {
      name: centralName as never,
      join: 'round',
      fill: filled ? 'filled' : 'outlined',
      radius: radius as '0' | '1' | '2' | '3',
      stroke: '2',
      mode: 'raw',
    })
  );
  const match = html.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  if (!match?.[1]) throw new Error(`Failed to extract SVG for ${name}@r${radius}`);
  const stroke = STROKE_OVERRIDES[name];
  const inner = stroke ? match[1].replaceAll('stroke-width="2"', `stroke-width="${stroke}"`) : match[1];
  const scale = OPTICAL_SCALE[name];
  return scale ? `<g transform="translate(12 12) scale(${scale}) translate(-12 -12)">${inner}</g>` : inner;
}

const discovered = discover();
if (discovered.size === 0) throw new Error('No icon usages found — did the scan roots change?');

// Chevrons implicitly resolve to radius 2 in the Icon component; make sure that
// variant exists even when no caller passed `radius='2'` explicitly.
for (const [name, radii] of discovered) {
  if (name.startsWith('IconChevron')) radii.add('2');
}

const names = [...discovered.keys()].sort();
const paths: Record<string, Record<string, string>> = {};
for (const name of names) {
  const radii = [...(discovered.get(name) ?? new Set([DEFAULT_RADIUS]))].sort();
  paths[name] = {};
  for (const r of radii) paths[name]![r] = renderIconPath(name, r);
}

const totalVariants = Object.values(paths).reduce((sum, map) => sum + Object.keys(map).length, 0);

function tsString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function renderNames(values: string[]): string {
  return `[\n${values.map((value) => `  ${tsString(value)},`).join('\n')}\n]`;
}

function renderPaths(values: Record<string, Record<string, string>>): string {
  const entries = Object.entries(values).map(([name, radii]) => {
    const radiusEntries = Object.entries(radii)
      .map(([radius, path]) => `    ${tsString(radius)}: ${tsString(path)},`)
      .join('\n');
    return `  ${name}: {\n${radiusEntries}\n  },`;
  });
  return `{\n${entries.join('\n')}\n}`;
}

writeFileSync(
  OUT,
  `// Generated by scripts/generate-icons.ts — do not edit by hand.
// Regenerate with: bun run generate:icons (runs automatically on dev/build).

export const ICON_NAMES = ${renderNames(names)} as const;
export type IconName = (typeof ICON_NAMES)[number];

export type IconRadius = '0' | '1' | '2' | '3';
export const DEFAULT_ICON_RADIUS: IconRadius = '${DEFAULT_RADIUS}';

export const ICON_PATHS: Record<IconName, Partial<Record<IconRadius, string>>> = ${renderPaths(paths)};
`
);

// biome-ignore lint/suspicious/noConsole: build script output
console.log(`[icons] ${names.length} icons (${totalVariants} variants) written to ${OUT.split('/').pop()}`);
