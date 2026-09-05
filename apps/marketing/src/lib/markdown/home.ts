import {
  agents,
  closing,
  deepDives,
  faq,
  features,
  hero,
  principles,
  selfHost,
  valueProps,
} from '../content';
import { site } from '../site';
import { SELF_HOST } from '../snippets';
import { renderFaq, renderPoints } from './blocks';
import { frontmatter } from './frontmatter';

export function renderHomeMarkdown(): string {
  return `${frontmatter({
    title: site.title,
    description: site.description,
    canonical: `${site.url}/`,
  })}

# ${hero.headline}

${hero.subheadline}

- [Start sending](${site.dashboardUrl})
- [BuzzKit on GitHub](${site.githubUrl})

## ${principles.title}

${principles.text}

${valueProps.map((prop) => `- **${prop.lead}** ${prop.text}`).join('\n')}

## Send a push with one call

\`\`\`
POST /v1/messages
{
  "to": "user_42",
  "topic": "gym-reminders",
  "title": "Leg day",
  "body": "Let's go. 6:00 with Maya.",
  "deepLink": "app://workouts/legs"
}
\`\`\`

BuzzKit answers 202 with a message id, resolves who is reachable, fans out through a durable queue and records every delivery attempt.

## Everything a push needs.

${features
  .map(
    (feature) =>
      `### ${feature.title}\n\n${feature.text}${feature.points.length > 0 ? `\n\n${renderPoints(feature.points)}` : ''}`
  )
  .join('\n\n')}

${deepDives.map((dive) => `## ${dive.title}\n\n${dive.text}\n\n${renderPoints(dive.points)}`).join('\n\n')}

## ${agents.title}

${agents.text}

- [llms.txt](${site.url}/llms.txt)
- [Everything on this site as one file](${site.url}/llms-full.txt)
- [OpenAPI description](${site.url}/openapi.json)
- [Authentication for agents](${site.url}/auth.md)
- [Agent skills index](${site.url}/.well-known/agent-skills/index.json)
- [BuzzKit integration skill](${site.url}/.well-known/agent-skills/buzzkit/SKILL.md)

## ${selfHost.title}

${selfHost.text}

${selfHost.facts.map((fact) => `- **${fact.lead}** ${fact.text}`).join('\n')}

\`\`\`
${SELF_HOST}
\`\`\`

## Frequently asked questions

${renderFaq(faq)}

## ${closing.title}

${closing.text}

- [Start sending](${site.dashboardUrl})
- [API Reference](${site.docsUrl})
- [Pricing](${site.url}/pricing.md)
`;
}
