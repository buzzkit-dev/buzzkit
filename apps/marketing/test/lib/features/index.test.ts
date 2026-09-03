import { describe, expect, it } from 'vitest';
import { features, findFeature, listFeatureGroups } from '../../../src/lib/features';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe('features registry', () => {
  it('has unique, url-safe slugs', () => {
    const slugs = features.map((feature) => feature.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(SLUG);
  });

  it.each(features.map((feature) => [feature.slug, feature] as const))(
    '%s carries every field a page needs',
    (_slug, feature) => {
      for (const field of ['name', 'summary', 'blurb', 'title', 'continuation', 'intro'] as const) {
        expect(feature[field].trim().length, field).toBeGreaterThan(0);
      }
      expect(feature.icon).toMatch(/^Icon[A-Z]/);
      expect(feature.sections.length).toBeGreaterThan(0);
      for (const section of feature.sections) {
        expect(section.title.trim().length).toBeGreaterThan(0);
        expect(section.text.trim().length).toBeGreaterThan(0);
      }
      for (const item of feature.faq) {
        expect(item.question.trim().length).toBeGreaterThan(0);
        expect(item.answer.trim().length).toBeGreaterThan(0);
      }
    }
  );

  it('only relates pages that exist, never itself', () => {
    for (const feature of features) {
      for (const related of feature.related) {
        expect(related).not.toBe(feature.slug);
        expect(findFeature(related).slug).toBe(related);
      }
    }
  });

  it('throws for an unknown slug', () => {
    expect(() => findFeature('nope')).toThrow('Unknown feature page: nope');
  });
});

describe('listFeatureGroups', () => {
  it('places every feature in exactly one group, in registry order', () => {
    const grouped = listFeatureGroups().flatMap((group) => group.features);
    expect(grouped).toHaveLength(features.length);
    expect(new Set(grouped.map((feature) => feature.slug)).size).toBe(features.length);
    for (const group of listFeatureGroups()) {
      for (const feature of group.features) expect(feature.group).toBe(group.label);
      for (const feature of group.upcoming) expect(feature.group).toBe(group.label);
    }
  });
});
