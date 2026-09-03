import { features } from '../features';
import { site } from '../site';

export function renderFeaturesIndex(): string {
  return `# BuzzKit features

> Every feature of BuzzKit, the open source notification orchestration layer, one page each with its markdown twin.

${features.map((feature) => `- [${feature.name}](${site.url}/features/${feature.slug}.md): ${feature.summary}`).join('\n')}

- Everything on the site: ${site.url}/llms.txt
`;
}
