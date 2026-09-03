import { describe, expect, it } from 'vitest';
import { renderPricingMarkdown } from '../../../src/lib/markdown/pricing';
import { delivery, matrix, plans, pricing, pricingFaq } from '../../../src/lib/pricing';
import { site } from '../../../src/lib/site';
import { expectTwinContract } from './contract';

describe('renderPricingMarkdown', () => {
  const markdown = renderPricingMarkdown();

  it('obeys the twin contract', () => {
    expectTwinContract(markdown, `${site.url}/pricing`);
    expect(markdown).toContain(`# ${pricing.title} ${pricing.continuation}`);
  });

  it('is deterministic', () => {
    expect(renderPricingMarkdown()).toBe(markdown);
  });

  it('lists the cloud plans first and self-hosting last', () => {
    const header = markdown.split('\n').find((line) => line.startsWith('|  | '));
    const names = header
      ?.split('|')
      .map((cell) => cell.trim())
      .filter(Boolean);
    const community = plans.find((plan) => plan.slug === 'community')!;
    expect(names?.at(-1)).toBe(community.name);
    expect(names).toHaveLength(plans.length);
  });

  it('carries every plan, delivery rule, matrix row and question', () => {
    for (const plan of plans) expect(markdown).toContain(`- **${plan.name}.** ${plan.audience}`);
    for (const row of delivery.rows) expect(markdown).toContain(`| ${row.action} | ${row.count} |`);
    for (const group of matrix) {
      expect(markdown).toContain(`| **${group.group}** |`);
      for (const row of group.rows)
        expect(markdown).toContain(`| ${row.feature}${row.planned ? ' (planned)' : ''} |`);
    }
    for (const item of pricingFaq) expect(markdown).toContain(`### ${item.question}`);
  });
});
