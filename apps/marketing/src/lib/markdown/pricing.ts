import { delivery, matrix, plans, pricing, pricingFaq, providers } from '../pricing';
import { site } from '../site';
import { renderCell, renderFaq } from './blocks';
import { frontmatter } from './frontmatter';

export function renderPricingMarkdown(): string {
  const ordered = [
    ...plans.filter((plan) => plan.slug !== 'community'),
    ...plans.filter((plan) => plan.slug === 'community'),
  ];
  const labels = [...new Set(ordered.flatMap((plan) => plan.numbers.map((entry) => entry.label)))];
  const header = `|  | ${ordered.map((plan) => plan.name).join(' | ')} |\n| --- | ${ordered.map(() => '---').join(' | ')} |`;
  const priceRow = `| Price | ${ordered.map((plan) => `${plan.prefix ?? ''}${plan.price}${plan.period ? ` ${plan.period}` : ''}`).join(' | ')} |`;
  const numberRows = labels
    .map(
      (label) =>
        `| ${label} | ${ordered.map((plan) => plan.numbers.find((entry) => entry.label === label)?.value ?? '—').join(' | ')} |`
    )
    .join('\n');
  const audiences = ordered
    .map((plan) => `- **${plan.name}.** ${plan.audience} ${plan.cta.label}: ${plan.cta.href}`)
    .join('\n');
  const deliveries = delivery.rows.map((row) => `| ${row.action} | ${row.count} |`).join('\n');
  const matrixRows = matrix
    .map((group) =>
      [
        `| **${group.group}** | ${ordered.map(() => '').join(' | ')} |`,
        ...group.rows.map(
          (row) =>
            `| ${row.feature}${row.planned ? ' (planned)' : ''} | ${row.cells.map(renderCell).join(' | ')} |`
        ),
      ].join('\n')
    )
    .join('\n');

  return `${frontmatter({
    title: 'Pricing · BuzzKit',
    description: `${pricing.beta.title} ${pricing.intro}`,
    canonical: `${site.url}/pricing`,
  })}

# ${pricing.title} ${pricing.continuation}

${pricing.intro}

**${pricing.beta.title}** ${pricing.beta.text}

## Plans

${header}
${priceRow}
${numberRows}

${audiences}

## Calculate your costs

Deliveries are active users times the notifications each of them gets. 50,000 active users receiving 3 notifications a week is about 650,000 deliveries a month: Pro at $49. The same users on a tool that charges $12 per 1,000 active users cost $600 a month before a single notification.

## ${delivery.title}

${delivery.text}

| Action | Deliveries |
| --- | --- |
${deliveries}

## ${providers.title}

${providers.text}

## Compare plans

${header}
${matrixRows}

## Questions

${renderFaq(pricingFaq)}

- [Start sending](${site.dashboardUrl})
- [Talk to us](${site.url}/contact.md)
`;
}
