import { describe, expect, it } from 'vitest';
import { features, findFeature } from '../../../src/lib/features';
import { renderFeatureMarkdown } from '../../../src/lib/markdown/feature';
import { site } from '../../../src/lib/site';
import { expectTwinContract } from './contract';

describe('renderFeatureMarkdown', () => {
  it.each(features.map((feature) => [feature.slug, feature] as const))(
    'renders %s to the twin contract',
    (slug, feature) => {
      const markdown = renderFeatureMarkdown(feature);
      expectTwinContract(markdown, `${site.url}/features/${slug}`);
      expect(markdown).toContain(`# ${feature.title} ${feature.continuation}`);
      expect(markdown).toContain(feature.intro);
      for (const section of feature.sections) {
        expect(markdown).toContain(`## ${section.title}`);
        if (section.code) expect(markdown).toContain(`\`\`\`\n${section.code}\n\`\`\``);
      }
      for (const related of feature.related) {
        expect(markdown).toContain(`${site.url}/features/${findFeature(related).slug}.md`);
      }
      expect(markdown.trimEnd().endsWith(`[BuzzKit on GitHub](${site.githubUrl})`)).toBe(true);
    }
  );

  it('omits the optional sections when a page has nothing for them', () => {
    const bare = { ...findFeature('workflows'), capabilities: [], faq: [], related: [] };
    const markdown = renderFeatureMarkdown(bare);
    expect(markdown).not.toContain('## Capabilities');
    expect(markdown).not.toContain('## Questions');
    expect(markdown).not.toContain('## Related');
    expect(markdown).toContain('## Start');
  });

  it('is deterministic', () => {
    const feature = findFeature('segments');
    expect(renderFeatureMarkdown(feature)).toBe(renderFeatureMarkdown(feature));
  });
});
