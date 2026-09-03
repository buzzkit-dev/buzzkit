import type { ComparePage } from './index';

export const apns: ComparePage = {
  slug: 'apns',
  competitor: 'Apple Push Notification service',
  short: 'APNs',
  summary:
    'What BuzzKit adds on top of raw APNs: subscribers, segments, scheduling, preferences, workflows and a delivery ledger.',
  blurb: 'Everything APNs leaves to you',
  title: 'BuzzKit vs raw APNs.',
  continuation: 'The transport, and everything around it.',
  intro:
    'APNs moves a payload to a device token and stops there. BuzzKit is everything around it: subscribers by your ids, segments, local-time delivery, workflows and a ledger of every attempt.',
  groups: [
    {
      group: 'Channels',
      rows: [
        { capability: 'iOS push', buzzkit: true, competitor: true },
        { capability: 'Live Activities', buzzkit: true, competitor: true },
        { capability: 'Android push', buzzkit: 'Soon', competitor: false },
        { capability: 'Email', buzzkit: 'Soon', competitor: false },
        { capability: 'SMS', buzzkit: 'Soon', competitor: false },
        { capability: 'In-app messages', buzzkit: false, competitor: false },
      ],
    },
    {
      group: 'Sending',
      rows: [
        { capability: 'Your own APNs and FCM keys', buzzkit: true, competitor: 'Is the transport' },
        { capability: 'Action buttons and deep links', buzzkit: true, competitor: 'Built by you' },
        { capability: 'Delivery in each subscriber’s time zone', buzzkit: true, competitor: false },
        { capability: 'Quiet hours and daily caps', buzzkit: true, competitor: false },
        { capability: 'A ledger of every delivery attempt', buzzkit: true, competitor: false },
      ],
    },
    {
      group: 'Audience',
      rows: [
        { capability: 'Subscribers by your own ids', buzzkit: true, competitor: 'Device tokens' },
        { capability: 'Unlimited subscribers', buzzkit: true, competitor: true },
        { capability: 'Segments over attributes and events', buzzkit: true, competitor: false },
        { capability: 'Topics and preferences', buzzkit: true, competitor: false },
        { capability: 'Tenants for platforms built on top of it', buzzkit: true, competitor: false },
      ],
    },
    {
      group: 'Automation',
      rows: [
        { capability: 'Workflows that start from user events', buzzkit: true, competitor: false },
        { capability: 'Conditions on what the user did', buzzkit: true, competitor: false },
        { capability: 'Wait for an event', buzzkit: true, competitor: false },
        { capability: 'Wait for a quiet moment on the device', buzzkit: true, competitor: false },
        { capability: 'Branches and loops', buzzkit: true, competitor: false },
        { capability: 'Call your own API from a step', buzzkit: true, competitor: false },
        { capability: 'Workflows as versioned specs', buzzkit: true, competitor: false },
        { capability: 'Webhooks from other tools as events', buzzkit: true, competitor: false },
      ],
    },
    {
      group: 'Platform',
      rows: [
        { capability: 'Open source', buzzkit: true, competitor: false },
        { capability: 'Hosted', buzzkit: true, competitor: 'Apple' },
        { capability: 'Self-hosted on your infrastructure', buzzkit: true, competitor: false },
        { capability: 'Pricing', buzzkit: 'Per delivery', competitor: 'Free' },
        { capability: 'Free plan', buzzkit: true, competitor: true },
      ],
    },
  ],
  chooseBuzzkit: [
    'You want everything a push needs in one place: sending, segments, scheduling, preferences, workflows and a ledger, from one POST.',
    'You would rather not build token storage, retries and delivery tracking yourself.',
    'You want users addressed by your own ids, with preferences they control.',
    'You run a platform and need isolated tenants with their own keys.',
  ],
  chooseCompetitor: [
    'You only ever send a handful of notifications from one backend.',
    'You want nothing between your server and the device.',
    'You already built the tooling around APNs and it works.',
  ],
  faq: [
    {
      question: 'Does BuzzKit replace APNs?',
      answer:
        'No. BuzzKit sends through APNs with your own key. It replaces the code around sending: tokens, targeting, scheduling, retries and the ledger.',
    },
    {
      question: 'Do I still need an Apple developer account?',
      answer:
        'Yes. The APNs key comes from your account and stays yours. BuzzKit stores it encrypted and uses it to send.',
    },
    {
      question: 'What happens when APNs reports a dead token?',
      answer:
        'The subscription flips to invalid and the change lands on the subscriber’s timeline. No later send is wasted on it.',
    },
  ],
};
