import { describe, expect, it } from 'vitest';
import { frontmatter } from '../../../src/lib/markdown/frontmatter';

describe('frontmatter', () => {
  it('renders the four fields in order with a dated last-updated line', () => {
    const block = frontmatter({
      title: 'Pricing · BuzzKit',
      description: 'Plans.',
      canonical: 'https://buzzkit.dev/pricing',
    });
    expect(block).toMatch(
      /^---\ntitle: Pricing · BuzzKit\ndescription: Plans\.\ncanonical: https:\/\/buzzkit\.dev\/pricing\nlast-updated: \d{4}-\d{2}-\d{2}\n---$/
    );
  });
});
