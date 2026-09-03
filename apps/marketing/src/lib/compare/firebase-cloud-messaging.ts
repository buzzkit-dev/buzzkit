import type { ComparePage } from './index';

export const firebaseCloudMessaging: ComparePage = {
  slug: 'firebase-cloud-messaging',
  competitor: 'Firebase Cloud Messaging',
  short: 'Firebase',
  summary:
    'What BuzzKit adds on top of Firebase Cloud Messaging: segments, scheduling, preferences, workflows and a delivery ledger.',
  blurb: 'Everything FCM leaves to you',
  title: 'BuzzKit vs Firebase Cloud Messaging.',
  continuation: 'The transport, and everything around it.',
  intro:
    'Firebase Cloud Messaging moves a message to a device token and stops there. BuzzKit is everything around that: subscribers, segments, scheduling, preferences, workflows and a ledger.',
  groups: [
    {
      group: 'Channels',
      rows: [
        { capability: 'iOS push', buzzkit: true, competitor: true },
        { capability: 'Live Activities', buzzkit: true, competitor: false },
        { capability: 'Android push', buzzkit: 'Soon', competitor: true },
        { capability: 'Email', buzzkit: 'Soon', competitor: false },
        { capability: 'SMS', buzzkit: 'Soon', competitor: false },
        { capability: 'In-app messages', buzzkit: false, competitor: true },
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
        {
          capability: 'Segments over attributes and events',
          buzzkit: true,
          competitor: 'Firebase audiences',
        },
        { capability: 'Topics and preferences', buzzkit: true, competitor: 'Topics only' },
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
        { capability: 'Hosted', buzzkit: true, competitor: true },
        { capability: 'Self-hosted on your infrastructure', buzzkit: true, competitor: false },
        { capability: 'Pricing', buzzkit: 'Per delivery', competitor: 'Free' },
        { capability: 'Free plan', buzzkit: true, competitor: true },
      ],
    },
  ],
  chooseBuzzkit: [
    'You want segments, scheduling and automation without building them yourself.',
    'You want one API and one ledger around APNs, with FCM on the same core next.',
    'You want users addressed by your own ids, with preferences they control.',
    'You run a platform and need isolated tenants with their own keys.',
  ],
  chooseCompetitor: [
    'You only need to deliver a message to a token.',
    'Your app lives in Firebase and the console covers your campaigns.',
    'You want nothing between your backend and the device.',
  ],
  faq: [
    {
      question: 'Does BuzzKit replace Firebase Cloud Messaging?',
      answer:
        'No. BuzzKit sits around the transports: APNs with your own key today, FCM with your own service account on the same core next. It replaces the code around sending, never the transport.',
    },
    {
      question: 'Do I still need Firebase for iOS?',
      answer:
        'No. BuzzKit talks to APNs directly with your Apple key, and the iOS SDK registers the device token. Android arrives through FCM with your own service account.',
    },
    {
      question: 'What happens when a provider reports a dead token?',
      answer:
        'The subscription flips to invalid and the change lands on the subscriber’s timeline. No later send is wasted on it.',
    },
  ],
};
