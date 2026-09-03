import { describe, expect, it } from 'vitest';
import { comparisons, findComparison } from '../../../src/lib/compare';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe('comparisons registry', () => {
  it('has unique, url-safe slugs', () => {
    const slugs = comparisons.map((comparison) => comparison.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(SLUG);
  });

  it.each(comparisons.map((comparison) => [comparison.slug, comparison] as const))(
    '%s carries every field a page needs',
    (_slug, comparison) => {
      for (const field of ['competitor', 'summary', 'blurb', 'title', 'continuation', 'intro'] as const) {
        expect(comparison[field].trim().length, field).toBeGreaterThan(0);
      }
      expect(comparison.groups.length).toBeGreaterThan(0);
      for (const group of comparison.groups) {
        expect(group.rows.length).toBeGreaterThan(0);
        for (const row of group.rows) {
          expect(row.capability.trim().length).toBeGreaterThan(0);
          expect(['boolean', 'string']).toContain(typeof row.buzzkit);
          expect(['boolean', 'string']).toContain(typeof row.competitor);
        }
      }
      expect(comparison.chooseBuzzkit.length).toBeGreaterThan(0);
      expect(comparison.chooseCompetitor.length).toBeGreaterThan(0);
      expect(comparison.faq.length).toBeGreaterThan(0);
    }
  );

  it('throws for an unknown slug', () => {
    expect(() => findComparison('nope')).toThrow('Unknown comparison page: nope');
  });
});
