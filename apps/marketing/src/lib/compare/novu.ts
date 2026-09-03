import type { ComparePage } from './index';

export const novu: ComparePage = {
  slug: 'novu',
  competitor: 'Novu',
  summary:
    'BuzzKit and Novu are both open source. Novu spans every channel; BuzzKit does mobile push completely.',
  blurb: 'Two open source takes on notifications',
  title: 'BuzzKit vs Novu.',
  continuation: 'Both open source, different depths.',
  intro:
    'Novu is open source notification infrastructure across email, in-app, SMS, chat and push. BuzzKit is open source too, and goes deep on mobile push: segments, local-time delivery, quiet moments and a ledger.',
  groups: [
    {
      group: 'Channels',
      rows: [
        { capability: 'iOS push', buzzkit: true, competitor: 'Through providers' },
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
        { capability: 'Action buttons and deep links', buzzkit: true, competitor: 'Provider payload' },
        { capability: 'Delivery in each subscriber’s time zone', buzzkit: true, competitor: false },
        { capability: 'Quiet hours and daily caps', buzzkit: true, competitor: 'Throttle step' },
        { capability: 'A ledger of every delivery attempt', buzzkit: true, competitor: 'Activity feed' },
      ],
    },
    {
      group: 'Audience',
      rows: [
        { capability: 'Subscribers by your own ids', buzzkit: true, competitor: true },
        { capability: 'Unlimited subscribers', buzzkit: true, competitor: true },
        { capability: 'Segments over attributes and events', buzzkit: true, competitor: 'Topics' },
        { capability: 'Topics and preferences', buzzkit: true, competitor: true },
        { capability: 'Tenants for platforms built on top of it', buzzkit: true, competitor: true },
      ],
    },
    {
      group: 'Automation',
      rows: [
        { capability: 'Workflows that start from user events', buzzkit: true, competitor: 'API trigger' },
        { capability: 'Conditions on what the user did', buzzkit: true, competitor: false },
        { capability: 'Wait for an event', buzzkit: true, competitor: false },
        { capability: 'Wait for a quiet moment on the device', buzzkit: true, competitor: false },
        { capability: 'Branches and loops', buzzkit: true, competitor: 'Step conditions' },
        { capability: 'Call your own API from a step', buzzkit: true, competitor: true },
        { capability: 'Workflows as versioned specs', buzzkit: true, competitor: 'Code-first framework' },
        { capability: 'Webhooks from other tools as events', buzzkit: true, competitor: false },
      ],
    },
    {
      group: 'Platform',
      rows: [
        { capability: 'Open source', buzzkit: true, competitor: true },
        { capability: 'Hosted', buzzkit: true, competitor: true },
        { capability: 'Self-hosted on your infrastructure', buzzkit: true, competitor: true },
        { capability: 'Pricing', buzzkit: 'Per delivery', competitor: 'Per workflow run' },
        { capability: 'Free plan', buzzkit: true, competitor: true },
      ],
    },
  ],
  chooseBuzzkit: [
    'You want everything a push needs in one place: sending, segments, scheduling, preferences, workflows and a ledger, from one POST.',
    'Mobile push is the channel that matters and you want it handled deeply.',
    'You want segments over your own events, not only topics.',
    'You run a platform and need isolated tenants with their own keys.',
  ],
  chooseCompetitor: [
    'You need email, in-app, SMS and chat from one workflow today.',
    'You want an in-app inbox component in your product.',
    'Your workflows live in your codebase with the Novu framework.',
  ],
  faq: [
    {
      question: 'Are BuzzKit and Novu both open source?',
      answer:
        'Yes. Both publish the code and offer a hosted version and self-hosting. BuzzKit is built around mobile push first; Novu is built around many channels.',
    },
    {
      question: 'Does BuzzKit have an in-app inbox?',
      answer:
        'No. BuzzKit sends push and tracks what happens to it. An inbox is a different product, and Novu ships one.',
    },
    {
      question: 'How is BuzzKit priced compared with Novu?',
      answer:
        'BuzzKit counts deliveries, one recipient on one channel. Novu counts workflow runs. Both have a free plan and unlimited subscribers.',
    },
  ],
};
