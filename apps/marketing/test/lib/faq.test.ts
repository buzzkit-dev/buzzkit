import { describe, expect, it } from 'vitest';
import { absolutizeFaqLinks, parseFaqAnswer, plainFaqAnswer } from '../../src/lib/faq';

describe('parseFaqAnswer', () => {
  it('keeps plain answers as a single text part', () => {
    expect(parseFaqAnswer('Yes. You can create as many workspaces as you like.')).toEqual([
      { start: 0, text: 'Yes. You can create as many workspaces as you like.' },
    ]);
  });

  it('splits markdown links out of the answer', () => {
    expect(parseFaqAnswer('See the [pricing page](/pricing) for full details.')).toEqual([
      { start: 0, text: 'See the ' },
      { start: 8, text: 'pricing page', href: '/pricing' },
      { start: 32, text: ' for full details.' },
    ]);
  });

  it('gives every part a distinct offset to key on', () => {
    const parts = parseFaqAnswer('One [a](/a) two [b](/b) three.');
    expect(new Set(parts.map((part) => part.start)).size).toBe(parts.length);
  });
});

describe('plainFaqAnswer', () => {
  it('keeps the link label and drops the target', () => {
    expect(plainFaqAnswer('See the [pricing page](/pricing) for full details.')).toBe(
      'See the pricing page for full details.'
    );
  });
});

describe('absolutizeFaqLinks', () => {
  it('rewrites root-relative targets against the site origin', () => {
    expect(
      absolutizeFaqLinks('See the [pricing page](/pricing) for full details.', 'https://buzzkit.dev')
    ).toBe('See the [pricing page](https://buzzkit.dev/pricing) for full details.');
  });
});
