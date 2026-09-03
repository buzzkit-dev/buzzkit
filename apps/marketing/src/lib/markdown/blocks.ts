import type { FaqItem } from '../content';
import { site } from '../site';

export const startLinks = `## Start

- [Start sending](${site.dashboardUrl})
- [API Reference](${site.docsUrl})
- [BuzzKit on GitHub](${site.githubUrl})`;

export function renderPoints(points: string[]): string {
  return points.map((point) => `- ${point}`).join('\n');
}

export function renderFaq(items: FaqItem[]): string {
  return items.map((item) => `### ${item.question}\n\n${item.answer}`).join('\n\n');
}

export function renderCell(value: boolean | string): string {
  if (value === true) return 'Yes';
  if (value === false) return '—';
  return value;
}
