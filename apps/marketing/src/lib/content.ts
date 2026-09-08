export interface ValueProp {
  icon: string;
  lead: string;
  text: string;
}

export interface Feature {
  id: string;
  icon: string;
  title: string;
  text: string;
  points: string[];
}

export interface DeepDive {
  id: string;
  title: string;
  text: string;
  points: string[];
}

export interface FaqItem {
  question: string;
  answer: string;
}

export const hero = {
  headline: 'The Open Source Notification Orchestration Layer.',
  subheadline: 'Send notifications, automate follow-ups and track delivery with one API.',
  primaryCta: 'Get Started',
  secondaryCta: 'Star on GitHub',
};

export const valueProps: ValueProp[] = [
  {
    icon: 'IconCodeLargeFilled',
    lead: 'Send with one call.',
    text: 'Send to a person or an audience. BuzzKit finds their devices and handles delivery.',
  },
  {
    icon: 'IconLayersTwoFilled',
    lead: 'Multi-tenant by design.',
    text: 'One workspace, a tenant per customer, each with its own subscribers, topics and credentials, sealed off from the rest.',
  },
  {
    icon: 'IconKey1',
    lead: 'Your keys, your data.',
    text: 'Your own provider credentials, encrypted, with no markup on messages and no shared provider account.',
  },
];

export const features: Feature[] = [
  {
    id: 'workflows',
    icon: 'IconSplitFilled',
    title: 'Workflows',
    text: 'Build event-based workflows with waits, conditions and follow-ups, with zero custom code.',
    points: ['Quiet-moment delivery', 'Dry runs before publish', 'Version history'],
  },
  {
    id: 'segments',
    icon: 'IconTargetFilled',
    title: 'Segments',
    text: 'Reach new users, paying customers or people who haven’t opened your app in a week.',
    points: ['Attribute and event conditions', 'Inline expressions on a send', 'Live preview counts'],
  },
  {
    id: 'scheduling',
    icon: 'IconCalendarClockFilled',
    title: 'Scheduling',
    text: 'Send at 9 a.m. in each user’s time zone, with quiet hours and daily limits built in.',
    points: ['Subscriber-timezone sends', 'Quiet hours and daily caps', 'Cancel until the last minute'],
  },
  {
    id: 'preferences',
    icon: 'IconToggle',
    title: 'Topics & preferences',
    text: 'Let users choose what they receive, with preferences automatically applied to every send.',
    points: ['Choices per topic and channel', 'Defaults with overrides', 'Preferences API'],
  },
  {
    id: 'sources',
    icon: 'IconWebhooksFilled',
    title: 'Sources',
    text: 'Connect integrations or custom webhooks to trigger notifications from the tools you already use.',
    points: [],
  },
  {
    id: 'live-activities',
    icon: 'IconLiveFullFilled',
    title: 'Live Activities',
    text: 'Start, update and end Live Activities for orders, scores and more, using the same API as your push notifications.',
    points: [],
  },
];

export const deepDives: DeepDive[] = [
  {
    id: 'delivery',
    title: 'See what happened to every push.',
    text: 'See whether a push was sent, delivered or opened, and why it failed, with automatic retries on failure.',
    points: [
      'Automatic retries for temporary failures',
      'Delivery and open receipts per device',
      'Progress for each message',
      'Request retries without a second message',
    ],
  },
  {
    id: 'ios',
    title: 'Add the SDK. Skip the token management.',
    text: 'Register your users and devices with the Swift SDK, which keeps device tokens up to date and tracks events even when offline.',
    points: [
      'Action buttons and deep links',
      'Event tracking while offline',
      'Live Activities and push-to-start',
      'Targeting by push permission',
    ],
  },
];

export const principles = {
  title: 'Notifications made easy.',
  text: 'Bring your provider credentials and let BuzzKit do the heavy lifting, from choosing who to notify to tracking actual delivery.',
};

export const agents = {
  title: 'Let your agent set it up.',
  text: 'Point your agent to BuzzKit to add notifications to your app, with agent-friendly pages and guides it can read along the way.',
  prompt: 'Add notifications to my app with buzzkit.dev',
  surface: [
    '/llms.txt',
    '/index.md',
    '/openapi.json',
    'SKILL.md',
    '/.well-known/ard.json',
    '/.well-known/agent-skills/index.json',
    'Accept: text/markdown',
    '/pricing.md',
    '/auth.md',
    '/developers.md',
    '/llms-full.txt',
    'Link: rel="alternate"',
  ],
};

export const selfHost = {
  title: 'Open source, top to bottom.',
  text: 'The API, dashboard and SDKs are fully open source. Run them yourself or use the hosted version.',
  facts: [
    {
      icon: 'IconGithub',
      lead: 'Open source.',
      text: 'The full product is in the repo. Nothing held back.',
    },
    {
      icon: 'IconServer1Filled',
      lead: 'Self-hosted.',
      text: 'Same API and dashboard, on your own servers.',
    },
    {
      icon: 'IconRocket',
      lead: 'Hosted.',
      text: 'Sign up and start sending. No servers to run.',
    },
  ],
};

export const faq: FaqItem[] = [
  {
    question: 'What do I need to start sending?',
    answer:
      'Your own provider credentials. Connect them in the dashboard and BuzzKit handles delivery, retries and tracking.',
  },
  {
    question: 'What do I need to add to my app?',
    answer:
      'Add the SDK, configure it with a client key and register users for push. The SDK handles device tokens and event tracking.',
  },
  {
    question: 'Does BuzzKit support Android or email?',
    answer: 'Currently only iOS, including Live Activities. Android, email and web push are coming.',
  },
  {
    question: 'Can I use BuzzKit for multiple apps?',
    answer: 'Yes. You can create as many workspaces as you like.',
  },
  {
    question: 'Can I build on top of BuzzKit?',
    answer:
      'Yes. Tenants are for when you send for your customers. Each tenant has its own subscribers, credentials and notifications.',
  },
  {
    question: 'Can I see if a notification was delivered?',
    answer: 'Yes. Native tracing shows whether it was sent, delivered or opened, and why it failed.',
  },
  {
    question: 'What does BuzzKit cost?',
    answer:
      'The hosted beta is free and unlimited, with no credit card required. See the [pricing page](/pricing) for full details.',
  },
  {
    question: 'Can I self-host BuzzKit?',
    answer: 'Yes. The API and dashboard are fully open source. Self-hosting guides are coming soon.',
  },
];

export const closing = {
  title: 'Send your first notification.',
  text: 'Free during the beta. No credit card required.',
};
