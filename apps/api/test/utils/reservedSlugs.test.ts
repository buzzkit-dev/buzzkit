import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isReservedSlug, RESERVED_SLUG_PREFIXES, RESERVED_SLUGS } from '@buzzkit/api/utils/reservedSlugs';
import { describe, expect, it } from 'vitest';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function readMarketingConfig(): string {
  return readFileSync(resolve(import.meta.dirname, '../../../marketing/wrangler.jsonc'), 'utf8');
}

function listMarketingSegments(): string[] {
  const patterns = [...readMarketingConfig().matchAll(/"pattern": "buzzkit\.dev\/([^"*]*)/g)].map(
    (match) => match[1] ?? ''
  );
  return patterns.map((pattern) => pattern.split('/')[0] ?? '').filter((segment) => SLUG.test(segment));
}

function listMarketingPrefixPatterns(): string[] {
  const patterns = [...readMarketingConfig().matchAll(/"pattern": "buzzkit\.dev\/([^"]*)"/g)].map(
    (match) => match[1] ?? ''
  );
  return patterns
    .filter((pattern) => pattern.endsWith('*') && !pattern.endsWith('/*'))
    .map((pattern) => pattern.slice(0, -1))
    .filter((segment) => SLUG.test(segment));
}

describe('reserved slugs', () => {
  it('covers every path the marketing site serves on buzzkit.dev', () => {
    const missing = listMarketingSegments().filter((segment) => !RESERVED_SLUGS.has(segment));
    expect(missing).toEqual([]);
  });

  it('keeps the dashboard entry paths', () => {
    for (const slug of ['dashboard', 'login', 'signup', 'onboarding', 'invite'])
      expect(RESERVED_SLUGS.has(slug)).toBe(true);
  });

  it('reserves the prefix of every marketing route that matches by prefix', () => {
    const missing = listMarketingPrefixPatterns().filter(
      (prefix) => !RESERVED_SLUG_PREFIXES.includes(prefix)
    );
    expect(missing).toEqual([]);
  });

  it('refuses a slug that a prefix route would swallow', () => {
    for (const slug of ['about-us-app', 'docs-team', 'pricing-2']) expect(isReservedSlug(slug)).toBe(true);
  });

  it('allows an ordinary slug', () => {
    for (const slug of ['cruisesignal', 'deskbot', 'acme', 'my-app', 'buzz-app', 'buzzkit-e2e'])
      expect(isReservedSlug(slug)).toBe(false);
  });
});
