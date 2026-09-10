import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RESERVED_SLUGS } from '@buzzkit/api/utils/reservedSlugs';
import { describe, expect, it } from 'vitest';

const FORWARDED_BY_DASHBOARD = ['buzzkit.dev/', 'buzzkit.dev/api'];

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

  it('end with a wildcard, so a query string still matches them', () => {
    for (const pattern of listRoutePatterns()) {
      if (FORWARDED_BY_DASHBOARD.includes(pattern)) continue;
      expect(pattern.endsWith('*'), pattern).toBe(true);
    }
  });
});
