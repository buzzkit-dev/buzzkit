import { describe, expect, it } from 'vitest';
import { renderCell, renderFaq, renderPoints, startLinks } from '../../../src/lib/markdown/blocks';
import { site } from '../../../src/lib/site';

describe('renderPoints', () => {
  it('renders a bullet per point', () => {
    expect(renderPoints(['One', 'Two'])).toBe('- One\n- Two');
    expect(renderPoints([])).toBe('');
  });
});

describe('renderFaq', () => {
  it('renders each question as a third-level heading over its answer', () => {
    expect(
      renderFaq([
        { question: 'Why?', answer: 'Because.' },
        { question: 'How?', answer: 'Like so.' },
      ])
    ).toBe('### Why?\n\nBecause.\n\n### How?\n\nLike so.');
  });
});

describe('renderCell', () => {
  it('spells out booleans and passes strings through', () => {
    expect(renderCell(true)).toBe('Yes');
    expect(renderCell(false)).toBe('—');
    expect(renderCell('Soon')).toBe('Soon');
  });
});

describe('startLinks', () => {
  it('links the dashboard, the docs and the repository', () => {
    expect(startLinks).toBe(
      `## Start\n\n- [Start sending](${site.dashboardUrl})\n- [API Reference](${site.docsUrl})\n- [BuzzKit on GitHub](${site.githubUrl})`
    );
  });
});
