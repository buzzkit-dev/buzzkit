import { describe, expect, it } from 'vitest';
import { comparisons } from '../../../src/lib/compare';
import { features } from '../../../src/lib/features';
import { renderHomeIndex } from '../../../src/lib/llms/home';
import { site } from '../../../src/lib/site';
import { listSitePaths, resolvesOnSite } from './links';

describe('renderHomeIndex', () => {
  const body = renderHomeIndex();

  it('opens with the site name and a one-paragraph description', () => {
    expect(body.startsWith('# BuzzKit\n\n> ')).toBe(true);
    expect(body).toContain('## When to use BuzzKit');
  });

  it('links every feature and comparison twin', () => {
    for (const feature of features) expect(body).toContain(`${site.url}/features/${feature.slug}.md`);
    for (const comparison of comparisons) expect(body).toContain(`${site.url}/compare/${comparison.slug}.md`);
  });

  it('only links paths the site serves', () => {
    const paths = listSitePaths(body);
    expect(paths.length).toBeGreaterThan(20);
    for (const path of paths) expect(resolvesOnSite(path), path).toBe(true);
  });

  it('is deterministic', () => {
    expect(renderHomeIndex()).toBe(body);
  });
});
