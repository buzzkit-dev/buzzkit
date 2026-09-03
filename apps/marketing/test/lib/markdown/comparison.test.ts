import { describe, expect, it } from 'vitest';
import { comparisons, findComparison } from '../../../src/lib/compare';
import { renderComparisonMarkdown } from '../../../src/lib/markdown/comparison';
import { site } from '../../../src/lib/site';
import { expectTwinContract } from './contract';

describe('renderComparisonMarkdown', () => {
  it.each(comparisons.map((comparison) => [comparison.slug, comparison] as const))(
    'renders %s to the twin contract',
    (slug, comparison) => {
      const markdown = renderComparisonMarkdown(comparison);
      expectTwinContract(markdown, `${site.url}/compare/${slug}`);
      expect(markdown).toContain(`# ${comparison.title} ${comparison.continuation}`);
      expect(markdown).toContain(`| Capability | BuzzKit | ${comparison.competitor} |`);
      const rows = comparison.groups.reduce((total, group) => total + group.rows.length, 0);
      const tableRows = markdown
        .split('\n')
        .filter((line) => line.startsWith('| ') && !line.startsWith('| **'));
      expect(tableRows).toHaveLength(rows + 2);
      expect(markdown).toContain(`## Choose ${comparison.competitor} when`);
      for (const item of comparison.faq) expect(markdown).toContain(`### ${item.question}`);
    }
  );

  it('is deterministic', () => {
    const comparison = findComparison('onesignal');
    expect(renderComparisonMarkdown(comparison)).toBe(renderComparisonMarkdown(comparison));
  });
});
