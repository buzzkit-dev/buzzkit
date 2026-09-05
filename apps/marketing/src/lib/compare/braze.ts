import type { ComparePage } from './index';

export const braze: ComparePage = {
  slug: 'braze',
  competitor: 'Braze',
  summary: 'An open source alternative to Braze for teams that want push as infrastructure, not a contract.',
  blurb: 'Push without the enterprise contract',
  title: 'BuzzKit vs Braze.',
  continuation: 'Push infrastructure without the enterprise contract.',
  intro:
    'Braze is an enterprise engagement platform sold to marketing teams. BuzzKit is push as infrastructure for developers, open source and ready in an afternoon.',
  groups: [
    {
      group: 'Channels',
      rows: [
        { capability: 'iOS push', buzzkit: true, competitor: true },
        { capability: 'Live Activities', buzzkit: true, competitor: true },
        { capability: 'Android push', buzzkit: 'Soon', competitor: true },
        { capability: 'Email', buzzkit: 'Soon', competitor: true },
        { capability: 'SMS', buzzkit: 'Soon', competitor: true },
        { capability: 'In-app messages', buzzkit: false, competitor: true },
      ],
    },
    {
      group: 'Sending',
      rows: [
        { capability: 'Your own APNs and FCM keys', buzzkit: true, competitor: true },
        { capability: 'Action buttons and deep links', buzzkit: true, competitor: true },
        { capability: 'Delivery in each subscriber’s time zone', buzzkit: true, competitor: true },
        { capability: 'Quiet hours and daily caps', buzzkit: true, competitor: true },
        { capability: 'A ledger of every delivery attempt', buzzkit: true, competitor: true },
      ],
    },
    {
      group: 'Audience',
      rows: [
        { capability: 'Subscribers by your own ids', buzzkit: true, competitor: true },
        { capability: 'Unlimited subscribers', buzzkit: true, competitor: 'Priced per active user' },
        { capability: 'Segments over attributes and events', buzzkit: true, competitor: true },
        { capability: 'Topics and preferences', buzzkit: true, competitor: true },
        { capability: 'Tenants for platforms built on top of it', buzzkit: true, competitor: false },
      ],
    },
    {
      group: 'Automation',
      rows: [
        { capability: 'Workflows that start from user events', buzzkit: true, competitor: true },
        { capability: 'Conditions on what the user did', buzzkit: true, competitor: true },
        { capability: 'Wait for an event', buzzkit: true, competitor: true },
        { capability: 'Wait for a quiet moment on the device', buzzkit: true, competitor: false },
        { capability: 'Branches and loops', buzzkit: true, competitor: true },
        { capability: 'Call your own API from a step', buzzkit: true, competitor: true },
        { capability: 'Workflows as versioned specs', buzzkit: true, competitor: false },
        { capability: 'Webhooks from other tools as events', buzzkit: true, competitor: 'Integrations' },
      ],
    },
    {
      group: 'Platform',
      rows: [
        { capability: 'Open source', buzzkit: true, competitor: false },
        { capability: 'Hosted', buzzkit: true, competitor: true },
        { capability: 'Self-hosted on your infrastructure', buzzkit: true, competitor: false },
        { capability: 'Pricing', buzzkit: 'Per delivery', competitor: 'Custom contract' },
        { capability: 'Free plan', buzzkit: true, competitor: false },
      ],
    },
  ],
  chooseBuzzkit: [
    'You want everything a push needs in one place: sending, segments, scheduling, preferences, workflows and a ledger, from one POST.',
    'Engineers own notifications and want an API, a spec and a ledger.',
    'You want to start in an afternoon without a sales process.',
    'You run a platform and need isolated tenants with their own keys.',
  ],
  chooseCompetitor: [
    'A marketing team runs campaigns across many channels from a console.',
    'You need in-app messages, content cards and cross-channel analytics.',
    'You need enterprise support and compliance programs today.',
  ],
  faq: [
    {
      question: 'Is BuzzKit meant for the same teams as Braze?',
      answer:
        'BuzzKit is built for developers who want push as infrastructure they own, while Braze serves marketing and growth teams with a console across many channels. Some companies will use one of each.',
    },
    {
      question: 'Can BuzzKit handle enterprise scale?',
      answer:
        'Yes. Sends fan out through a durable queue in pages that resume where they left off, retries back off for hours, and every subscriber has their own isolated actor. A million-subscriber topic is thousands of small jobs that pick themselves back up if anything fails.',
    },
    {
      question: 'Does BuzzKit have analytics?',
      answer:
        'The dashboard shows subscribers, deliveries, events and runs over time, and every message carries live counts per outcome. Deeper analysis reads the event stream, which is yours to query.',
    },
  ],
};
