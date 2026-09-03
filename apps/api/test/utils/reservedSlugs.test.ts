import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RESERVED_SLUGS } from '@buzzkit/api/utils/reservedSlugs';
import { describe, expect, it } from 'vitest';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function listMarketingSegments(): string[] {
  const config = readFileSync(resolve(import.meta.dirname, '../../../marketing/wrangler.jsonc'), 'utf8');
  const patterns = [...config.matchAll(/"pattern": "buzzkit\.dev\/([^"*]*)/g)].map((match) => match[1] ?? '');
  return patterns.map((pattern) => pattern.split('/')[0] ?? '').filter((segment) => SLUG.test(segment));
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
});
