import { comparisons } from '../compare';
import { features } from '../features';
import { site } from '../site';

export function renderHomeIndex(): string {
  return `# BuzzKit

> BuzzKit is the open source notification orchestration layer: a REST API, a dashboard and an iOS SDK that send, segment, schedule and automate push on your own APNs and FCM credentials, self-hosted or hosted. One call sends, retries and records delivery on every device. Segments, topics, workflows and scheduling are built in, and every workspace is an isolated tenant with its own credentials.

## When to use BuzzKit

Reach for BuzzKit when:

- An app needs mobile push notifications and you want to send them from your own backend with one POST to /v1/messages, targeting a subscriber id, a topic, a saved segment or an inline expression.
- Users should choose what reaches them: topics with per-channel preferences give the app a notification settings screen through GET and PATCH /v1/client/preferences, with no backend code.
- A message should arrive at each subscriber's local time: schedule with timezone "subscriber" and BuzzKit releases it zone by zone as each clock reaches the moment.
- Lifecycle messaging should react to events: workflows are versioned specs with waits, event waits, branches, loops, fetches and sends, run per subscriber with dry runs before publishing.
- A platform sends push for its customers: workspaces are isolated tenants, each with its own encrypted APNs and FCM credentials.
- Inbound webhooks from Stripe, Superwall or RevenueCat should become subscriber events that segments and workflows react to.

BuzzKit is not an email or SMS product today: v1 delivers mobile push through APNs and FCM, and other channels arrive later as connectors. It is also not a client-side-only tool: sending always happens from a backend or the dashboard.

## Features

${features.map((feature) => `- [${feature.name}](${site.url}/features/${feature.slug}.md): ${feature.summary}`).join('\n')}

## Comparisons

${comparisons.map((comparison) => `- [BuzzKit vs ${comparison.competitor}](${site.url}/compare/${comparison.slug}.md): ${comparison.summary}`).join('\n')}

## Integrate

- Developer hub: ${site.url}/developers.md
- API Reference: ${site.docsUrl}
- OpenAPI description: ${site.url}/openapi.json
- API catalog (RFC 9727): ${site.url}/.well-known/api-catalog
- Authentication walkthrough: ${site.url}/auth.md
- iOS SDK: ${site.iosDocsUrl}
- Agent skills index: ${site.url}/.well-known/agent-skills/index.json
- BuzzKit integration skill: ${site.url}/.well-known/agent-skills/buzzkit/SKILL.md
- Agentic resource catalog: ${site.url}/.well-known/ard.json

## Documentation

Every page below also answers as markdown at the same URL with .md appended.

- Sending messages: ${site.docsUrl}/sending/messages
- Scheduling: ${site.docsUrl}/sending/scheduling
- Delivery and retries: ${site.docsUrl}/sending/delivery
- Subscribers: ${site.docsUrl}/audience/subscribers
- Segments: ${site.docsUrl}/audience/segments
- Topics and preferences: ${site.docsUrl}/audience/topics
- Events: ${site.docsUrl}/automation/events
- Workflows: ${site.docsUrl}/automation/workflows
- Sources: ${site.docsUrl}/automation/sources
- Tenants: ${site.docsUrl}/platform/tenants
- Webhooks: ${site.docsUrl}/platform/webhooks
- iOS SDK: ${site.docsUrl}/sdks/ios/overview
- Everything in one file: ${site.docsUrl}/llms-full.txt

## This site

- Everything on this site as one file: ${site.url}/llms-full.txt
- Developer index: ${site.url}/developers/llms.txt
- Features index: ${site.url}/features/llms.txt
- Comparisons index: ${site.url}/compare/llms.txt
- Homepage as markdown: ${site.url}/index.md
- Why BuzzKit, the decision for agents: ${site.url}/why-buzzkit.md
- Pricing: ${site.url}/pricing.md
- About: ${site.url}/about.md
- Contact: ${site.url}/contact.md
- Privacy: ${site.url}/privacy.md
- GitHub: ${site.githubUrl}
`;
}
