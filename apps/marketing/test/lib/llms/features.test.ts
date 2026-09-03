import { describe, expect, it } from 'vitest';
import { features } from '../../../src/lib/features';
import { renderFeaturesIndex } from '../../../src/lib/llms/features';
import { site } from '../../../src/lib/site';
import { listSitePaths, resolvesOnSite } from './links';

describe('renderFeaturesIndex', () => {
  const body = renderFeaturesIndex();

  it('lists every feature twin and links back to llms.txt', () => {
    expect(body.startsWith('# BuzzKit features\n\n> ')).toBe(true);
    for (const feature of features) {
      expect(body).toContain(
        `- [${feature.name}](${site.url}/features/${feature.slug}.md): ${feature.summary}`
      );
    }
    expect(body).toContain(`${site.url}/llms.txt`);
  });

  it('only links paths the site serves', () => {
    for (const path of listSitePaths(body)) expect(resolvesOnSite(path), path).toBe(true);
  });
});
