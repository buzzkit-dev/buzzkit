import type { ComparePage } from '../compare';
import { site } from '../site';
import { renderCell, renderFaq, renderPoints, startLinks } from './blocks';
import { frontmatter } from './frontmatter';

export function renderComparisonMarkdown(comparison: ComparePage): string {
  const rows = comparison.groups
    .map((group) =>
      [
        `| **${group.group}** | | |`,
        ...group.rows.map(
          (row) => `| ${row.capability} | ${renderCell(row.buzzkit)} | ${renderCell(row.competitor)} |`
        ),
      ].join('\n')
    )
    .join('\n');

  return `${frontmatter({
    title: `BuzzKit vs ${comparison.competitor}`,
    description: comparison.summary,
    canonical: `${site.url}/compare/${comparison.slug}`,
  })}

# ${comparison.title} ${comparison.continuation}

${comparison.intro}

## Side by side

| Capability | BuzzKit | ${comparison.competitor} |
| --- | --- | --- |
${rows}

## Choose BuzzKit when

${renderPoints(comparison.chooseBuzzkit)}

## Choose ${comparison.competitor} when

${renderPoints(comparison.chooseCompetitor)}

## Questions

${renderFaq(comparison.faq)}

${startLinks}
`;
}
