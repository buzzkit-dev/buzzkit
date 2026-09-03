import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RESERVED_SLUGS } from '@buzzkit/api/utils/reservedSlugs';
import { describe, expect, it } from 'vitest';

function listRouteSegments(): string[] {
  const jsonc = readFileSync(join(process.cwd(), 'wrangler.jsonc'), 'utf8');
  const config = JSON.parse(jsonc.replace(/^\s*\/\/.*$/gm, '')) as { routes: { pattern: string }[] };
  const segments = config.routes.map(
    (route) => route.pattern.replace(/^buzzkit\.dev\//, '').split(/[/*.]/)[0]!
  );
  return [...new Set(segments.filter((segment) => segment.length > 0 && !segment.startsWith('_')))];
}

describe('marketing routes', () => {
  it('are all reserved workspace slugs in the API', () => {
    const segments = listRouteSegments();
    expect(segments.length).toBeGreaterThan(10);
    for (const segment of segments) expect(RESERVED_SLUGS.has(segment), segment).toBe(true);
  });
});
