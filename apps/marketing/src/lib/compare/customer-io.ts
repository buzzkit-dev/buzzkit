import type { ComparePage } from './index';

export const customerIo: ComparePage = {
  slug: 'customer-io',
  competitor: 'Customer.io',
  summary: 'An open source alternative to Customer.io for event-driven mobile push, built for developers.',
  blurb: 'Infrastructure, not a marketing suite',
  title: 'BuzzKit vs Customer.io.',
  continuation: 'Event-driven messaging, as a framework.',
  intro:
    'Customer.io is a marketing automation platform for growth teams. BuzzKit takes the same event-driven model to push, built for developers.',
  groups: [
    {
      group: 'Channels',
      rows: [
        { capability: 'iOS push', buzzkit: true, competitor: true },
        { capability: 'Live Activities', buzzkit: true, competitor: false },
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
        { capability: 'A ledger of every delivery attempt', buzzkit: true, competitor: 'Delivery logs' },
      ],
    },
    {
      group: 'Audience',
      rows: [
        { capability: 'Subscribers by your own ids', buzzkit: true, competitor: true },
        { capability: 'Unlimited subscribers', buzzkit: true, competitor: 'Priced per profile' },
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
        { capability: 'Pricing', buzzkit: 'Per delivery', competitor: 'Per profile' },
        { capability: 'Free plan', buzzkit: true, competitor: false },
      ],
    },
  ],
  chooseBuzzkit: [
    'You want everything a push needs in one place: sending, segments, scheduling, preferences, workflows and a ledger, from one POST.',
    'Push is your channel and you want a real delivery ledger.',
    'Engineers write workflows as specs, dry-run them and version them.',
    'You run a platform and need isolated tenants with their own keys.',
  ],
  chooseCompetitor: [
    'Marketing owns the journeys and wants a visual builder with templates.',
    'You need email, SMS and in-app from one platform today.',
    'You want a vendor with a long enterprise track record today.',
  ],
  faq: [
    {
      question: 'Can I send my existing events to BuzzKit?',
      answer:
        'Yes. Track events from your backend with one POST or from the app through the SDK, and turn Stripe, Superwall or RevenueCat webhooks into events with a source.',
    },
    {
      question: 'Does BuzzKit have a visual journey builder?',
      answer:
        'Workflows are defined in the dashboard or through the API as a spec, shown as a flow with its lanes and run paths. There is no drag-and-drop canvas; the spec is the source of truth.',
    },
    {
      question: 'Is BuzzKit a marketing tool?',
      answer:
        'BuzzKit is the open source notification orchestration layer, built for developers. It covers sending, targeting, scheduling and automation for push as code and API you own, and leaves email campaigns and landing pages to other tools.',
    },
  ],
};
