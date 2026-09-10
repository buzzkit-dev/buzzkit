import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RESERVED_SLUGS } from '@buzzkit/api/utils/reservedSlugs';
import { describe, expect, it } from 'vitest';

function listRoutePatterns(): string[] {
  const jsonc = readFileSync(join(process.cwd(), 'wrangler.jsonc'), 'utf8');
  const config = JSON.parse(jsonc.replace(/^\s*\/\/.*$/gm, '')) as { routes: { pattern: string }[] };
  return config.routes.map((route) => route.pattern);
}

function listRouteSegments(): string[] {
  const segments = listRoutePatterns().map(
    (pattern) => pattern.replace(/^buzzkit\.dev\//, '').split(/[/*.?]/)[0]!
  );
  return [...new Set(segments.filter((segment) => segment.length > 0 && !segment.startsWith('_')))];
}

describe('marketing routes', () => {
  it('are all reserved workspace slugs in the API', () => {
    const segments = listRouteSegments();
    expect(segments.length).toBeGreaterThan(10);
    for (const segment of segments) expect(RESERVED_SLUGS.has(segment), segment).toBe(true);
  });

  it('match their own paths with a query string', () => {
    const patterns = new Set(listRoutePatterns());
    for (const pattern of patterns) {
      if (pattern.endsWith('*')) continue;
      const covered = patterns.has(`${pattern}?*`) || patterns.has(`${pattern}*`);
      expect(covered, pattern).toBe(true);
    }
  });
});
