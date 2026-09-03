import { describe, expect, it } from 'vitest';
import { comparisons } from '../../../src/lib/compare';
import { features } from '../../../src/lib/features';
import { renderFullSite } from '../../../src/lib/llms/full';

describe('renderFullSite', () => {
  const body = renderFullSite();
  const documents = body.split('\n\n---\n\n');

  it('concatenates every twin: home, features, comparisons, pricing and the five hand-kept pages', () => {
    expect(documents).toHaveLength(1 + features.length + comparisons.length + 1 + 5);
    for (const document of documents) expect(document.startsWith('# ')).toBe(true);
  });

  it('strips every frontmatter block', () => {
    expect(body).not.toContain('\ntitle: ');
    expect(body).not.toContain('last-updated:');
  });

  it('ends with one newline', () => {
    expect(body.endsWith('\n')).toBe(true);
    expect(body.endsWith('\n\n')).toBe(false);
  });
});
