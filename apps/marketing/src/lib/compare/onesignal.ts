import type { ComparePage } from './index';

export const onesignal: ComparePage = {
  slug: 'onesignal',
  competitor: 'OneSignal',
  summary: 'An open source alternative to OneSignal: everything a push needs, from one API.',
  blurb: 'The same job, simpler and open',
  title: 'BuzzKit vs OneSignal.',
  continuation: 'The same job, nothing to assemble.',
  intro:
    'OneSignal is a hosted messaging service across push, email, SMS and in-app. BuzzKit is the open source layer that does the push part completely: sending, segments, scheduling, preferences, workflows and a ledger, from one API.',
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
        {
          capability: 'A ledger of every delivery attempt',
          buzzkit: true,
          competitor: 'Delivery statistics',
        },
      ],
    },
    {
      group: 'Audience',
      rows: [
        { capability: 'Subscribers by your own ids', buzzkit: true, competitor: true },
        { capability: 'Unlimited subscribers', buzzkit: true, competitor: 'Priced per active user' },
        {
          capability: 'Segments over attributes and events',
          buzzkit: true,
          competitor: 'Events in early access',
        },
        { capability: 'Topics and preferences', buzzkit: true, competitor: true },
        { capability: 'Tenants for platforms built on top of it', buzzkit: true, competitor: false },
      ],
    },
    {
      group: 'Automation',
      rows: [
        { capability: 'Workflows that start from user events', buzzkit: true, competitor: true },
        { capability: 'Conditions on what the user did', buzzkit: true, competitor: 'Early access' },
        { capability: 'Wait for an event', buzzkit: true, competitor: true },
        { capability: 'Wait for a quiet moment on the device', buzzkit: true, competitor: false },
        { capability: 'Branches and loops', buzzkit: true, competitor: true },
        { capability: 'Call your own API from a step', buzzkit: true, competitor: false },
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
        { capability: 'Pricing', buzzkit: 'Per delivery', competitor: 'Per active user' },
        { capability: 'Free plan', buzzkit: true, competitor: true },
      ],
    },
  ],
  chooseBuzzkit: [
    'You want everything a push needs in one place: sending, segments, scheduling, preferences, workflows and a ledger, from one POST.',
    'Push is the channel that matters and you want a real ledger.',
    'You run a platform and need isolated tenants with their own keys.',
    'You automate from events your backend and app already emit.',
  ],
  chooseCompetitor: [
    'You need email, SMS and in-app from one vendor today.',
    'You want a vendor with a long enterprise track record today.',
    'You need SDKs for every platform today, not iOS first.',
  ],
  faq: [
    {
      question: 'Can I move from OneSignal to BuzzKit?',
      answer:
        'Yes. Device tokens belong to your app, so register them with BuzzKit through the iOS SDK or the subscriptions API, identify subscribers by your own ids, and recreate segments as expressions.',
    },
    {
      question: 'Does BuzzKit support Android?',
      answer:
        'Not yet. BuzzKit starts with a complete iOS experience. Android sits on the same core and follows.',
    },
    {
      question: 'Is the hosted version free?',
      answer:
        'The hosted version is free while BuzzKit is in beta, and self-hosting stays free. Existing workspaces will be told before any billing starts.',
    },
  ],
};
