import type { ComparePage } from './index';

export const knock: ComparePage = {
  slug: 'knock',
  competitor: 'Knock',
  summary:
    'An open source alternative to Knock for teams whose channel is mobile push, with segments, scheduling, preferences, workflows and a ledger built in.',
  blurb: 'Push done deeply, not widely',
  title: 'BuzzKit vs Knock.',
  continuation: 'Push done deeply, nothing to assemble.',
  intro:
    'Knock is hosted notification infrastructure across many channels. BuzzKit does mobile push deeply and open source: segments, scheduling, preferences, workflows and a ledger built in.',
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
        { capability: 'Delivery in each subscriber’s time zone', buzzkit: true, competitor: false },
        { capability: 'Quiet hours and daily caps', buzzkit: true, competitor: false },
        { capability: 'A ledger of every delivery attempt', buzzkit: true, competitor: true },
      ],
    },
    {
      group: 'Audience',
      rows: [
        { capability: 'Subscribers by your own ids', buzzkit: true, competitor: true },
        { capability: 'Unlimited subscribers', buzzkit: true, competitor: true },
        { capability: 'Segments over attributes and events', buzzkit: true, competitor: true },
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
        { capability: 'Branches and loops', buzzkit: true, competitor: true },
        { capability: 'Call your own API from a step', buzzkit: true, competitor: true },
        { capability: 'Workflows as versioned specs', buzzkit: true, competitor: true },
        { capability: 'Webhooks from other tools as events', buzzkit: true, competitor: 'Integrations' },
      ],
    },
    {
      group: 'Platform',
      rows: [
        { capability: 'Open source', buzzkit: true, competitor: false },
        { capability: 'Hosted', buzzkit: true, competitor: true },
        { capability: 'Self-hosted on your infrastructure', buzzkit: true, competitor: false },
        { capability: 'Pricing', buzzkit: 'Per delivery', competitor: 'Per notification' },
        { capability: 'Free plan', buzzkit: true, competitor: true },
      ],
    },
  ],
  chooseBuzzkit: [
    'You want everything a push needs in one place: sending, segments, scheduling, preferences, workflows and a ledger, from one POST.',
    'Mobile push is the channel that matters and you want it handled deeply.',
    'You want segments over your own events, not only workflow conditions.',
    'You run a platform and need isolated tenants with their own keys.',
  ],
  chooseCompetitor: [
    'You need email, SMS, chat and in-app from one workflow today.',
    'You want hosted preference and inbox components in your product.',
    'You want a vendor with a long enterprise track record today.',
  ],
  faq: [
    {
      question: 'Are BuzzKit workflows comparable to Knock workflows?',
      answer:
        'Both run a sequence of steps per recipient with delays and branches. BuzzKit workflows also wait for events or a quiet moment on the device, loop, call your API with a secret, and dry-run against a real subscriber before publishing.',
    },
    {
      question: 'Does BuzzKit send email?',
      answer:
        'Not yet. The first version delivers mobile push through APNs and FCM, and channels are generic in the core, so email arrives later as a connector.',
    },
    {
      question: 'Do I have to self-host BuzzKit?',
      answer:
        'No. The hosted version is the easiest way in and free during the beta. Self-hosting is there when you want it, with the same code.',
    },
  ],
};
