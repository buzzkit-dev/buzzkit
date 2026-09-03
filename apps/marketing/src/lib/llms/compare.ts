import { comparisons } from '../compare';
import { site } from '../site';

export function renderComparisonsIndex(): string {
  return `# BuzzKit compared

> How BuzzKit, the open source notification orchestration layer, compares with the tools people consider alongside it.

${comparisons.map((comparison) => `- [BuzzKit vs ${comparison.competitor}](${site.url}/compare/${comparison.slug}.md): ${comparison.summary}`).join('\n')}

- Everything on the site: ${site.url}/llms.txt
`;
}
