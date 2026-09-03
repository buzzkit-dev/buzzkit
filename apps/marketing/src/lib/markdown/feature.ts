import { type FeaturePage, findFeature } from '../features';
import { site } from '../site';
import { renderFaq, renderPoints, startLinks } from './blocks';
import { frontmatter } from './frontmatter';

export function renderFeatureMarkdown(feature: FeaturePage): string {
  const sections = feature.sections
    .map((section) => {
      let detail = '';
      if (section.code) detail = `\n\n\`\`\`\n${section.code}\n\`\`\``;
      else if (section.points) detail = `\n\n${renderPoints(section.points)}`;
      return `## ${section.title}\n\n${section.text}${detail}`;
    })
    .join('\n\n');
  const capabilities = feature.capabilities.map((entry) => `- **${entry.title}.** ${entry.text}`).join('\n');
  const related = feature.related
    .map((slug) => {
      const entry = findFeature(slug);
      return `- [${entry.name}](${site.url}/features/${entry.slug}.md): ${entry.summary}`;
    })
    .join('\n');

  return `${frontmatter({
    title: `${feature.name} · BuzzKit`,
    description: feature.summary,
    canonical: `${site.url}/features/${feature.slug}`,
  })}

# ${feature.title} ${feature.continuation}

${feature.intro}

${sections}

${capabilities ? `## Capabilities\n\n${capabilities}\n\n` : ''}${feature.faq.length > 0 ? `## Questions\n\n${renderFaq(feature.faq)}\n\n` : ''}${related ? `## Related\n\n${related}\n\n` : ''}${startLinks}
`;
}
