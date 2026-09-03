import { describe, expect, it } from 'vitest';
import { comparisons } from '../../../src/lib/compare';
import { renderComparisonsIndex } from '../../../src/lib/llms/compare';
import { site } from '../../../src/lib/site';
import { listSitePaths, resolvesOnSite } from './links';

describe('renderComparisonsIndex', () => {
  const body = renderComparisonsIndex();

  it('lists every comparison twin and links back to llms.txt', () => {
    expect(body.startsWith('# BuzzKit compared\n\n> ')).toBe(true);
    for (const comparison of comparisons) {
      expect(body).toContain(
        `- [BuzzKit vs ${comparison.competitor}](${site.url}/compare/${comparison.slug}.md)`
      );
    }
    expect(body).toContain(`${site.url}/llms.txt`);
  });

  it('only links paths the site serves', () => {
    for (const path of listSitePaths(body)) expect(resolvesOnSite(path), path).toBe(true);
  });
});
