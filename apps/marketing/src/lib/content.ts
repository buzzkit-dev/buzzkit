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
  headline: 'The open source notification orchestration layer.',
  subheadline:
    'One call sends, retries and lands on every device. Segments, workflows and scheduling are built in, and your users choose what reaches them.',
  primaryCta: 'Get Started',
  secondaryCta: 'Star on GitHub',
};

export const valueProps: ValueProp[] = [
  {
    icon: 'IconCodeLargeFilled',
    lead: 'Code-first.',
    text: 'A REST API and a typed SDK. Every object your code creates shows up in the dashboard as it is.',
  },
  {
    icon: 'IconLayersTwoFilled',
    lead: 'Multi-tenant by design.',
    text: 'One workspace, a tenant per customer, each with its own subscribers, topics and credentials.',
  },
  {
    icon: 'IconKey1',
    lead: 'Your keys, your data.',
    text: 'Your own Apple and Firebase credentials. Nothing sits between you and the providers.',
  },
];

export const features: Feature[] = [
  {
    id: 'workflows',
    icon: 'IconSplitFilled',
    title: 'Workflows',
    text: 'Waits, branches and sends that respect every subscriber’s clock.',
    points: ['Quiet-moment delivery', 'Dry runs before publish', 'Versioned specs'],
  },
  {
    id: 'segments',
    icon: 'IconTargetFilled',
    title: 'Segments',
    text: 'Who a subscriber is and what they did, evaluated at send time.',
    points: ['Attribute and event conditions', 'Inline expressions on a send', 'Live preview counts'],
  },
  {
    id: 'scheduling',
    icon: 'IconCalendarClockFilled',
    title: 'Scheduling',
    text: 'One message, delivered in each subscriber’s time zone.',
    points: ['Subscriber-timezone sends', 'Quiet hours and daily caps', 'Cancel until the last minute'],
  },
  {
    id: 'preferences',
    icon: 'IconToggle',
    title: 'Topics & Preferences',
    text: 'A notification settings screen with no backend code.',
    points: ['Choices per topic and channel', 'Defaults with overrides', 'One GET, one PATCH'],
  },
  {
    id: 'sources',
    icon: 'IconWebhooksFilled',
    title: 'Sources',
    text: 'Turn any webhook into subscriber events, presets included.',
    points: [],
  },
  {
    id: 'live-activities',
    icon: 'IconLiveFullFilled',
    title: 'Live Activities',
    text: 'Start, update and end iOS Live Activities from the same API.',
    points: [],
  },
];

export const deepDives: DeepDive[] = [
  {
    id: 'delivery',
    title: 'Every attempt, accounted for.',
    text: 'A durable queue fans out to every reachable device and retries for hours. Every attempt keeps its request, response and latency.',
    points: [
      'Progressive retries with jitter',
      'Dead tokens invalidated automatically',
      'One error language across all channels',
      'Idempotent sends, never a double push',
    ],
  },
  {
    id: 'ios',
    title: 'Drop the SDK in. The rest is wired.',
    text: 'Identify, register and track in four lines. Offline queueing, action buttons, deep links and more come built in.',
    points: [
      'Action buttons and deep links',
      'Offline event queue with replay',
      'Live Activities and push-to-start',
      'Permission state as a segment condition',
    ],
  },
];

export const principles = {
  title: 'Infrastructure you own.',
  text: 'Your code, your workspaces, your credentials.',
};

export const agents = {
  title: 'Agent native, end to end.',
  text: 'Every page ships as markdown, the API as a spec and the integration guide as a skill. Your agent can wire push into your app in two prompts.',
  prompt: 'Add push notifications to my app with BuzzKit',
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
  text: 'Everything is open source, from the API, the dashboard and the SDKs to the schemas. Use the hosted version, or self-host the same code on your own.',
  facts: [
    {
      icon: 'IconGithub',
      lead: 'Open source.',
      text: 'Every feature in the repository. Nothing held back.',
    },
    {
      icon: 'IconServer1Filled',
      lead: 'Self-hostable.',
      text: 'Run the same API and dashboard we run, on your own infrastructure.',
    },
    {
      icon: 'IconRocket',
      lead: 'Hosted.',
      text: 'The easiest way in. Run by us at buzzkit.dev, always on the latest.',
    },
  ],
};

export const faq: FaqItem[] = [
  {
    question: 'What is BuzzKit?',
    answer:
      'The open source notification orchestration layer. A REST API, a dashboard and an iOS SDK for sending, segmenting, scheduling and automating push, on your own Apple and Firebase credentials.',
  },
  {
    question: 'How do I send a notification?',
    answer:
      'One POST to /v1/messages with a title, a body and a recipient: a subscriber, a topic or a segment. BuzzKit works out who is reachable, delivers to every device, retries and records each attempt.',
  },
  {
    question: 'Do I need my own APNs and FCM keys?',
    answer:
      'Yes. BuzzKit sends with your credentials, never through a shared account. Each workspace and tenant keeps its own keys, encrypted.',
  },
  {
    question: 'Can users choose what they receive?',
    answer:
      'Yes. Topics give your app a notification settings screen with no backend code. Subscribers opt in or out per topic, and every send respects that.',
  },
  {
    question: 'Can I send at each user’s local time?',
    answer:
      'Yes. Schedule a message for 9:00 in the subscriber’s time zone and it reaches each person when their own clock gets there.',
  },
  {
    question: 'Which platforms are supported?',
    answer:
      'iOS today. BuzzKit is built multi-channel, with Android, email and web push as connectors on the same core, and starts with a complete iOS experience.',
  },
  {
    question: 'Can I self-host?',
    answer:
      'Yes. The whole thing is open source and runs on your own infrastructure. The hosted version at buzzkit.dev is the easiest way to start.',
  },
];

export const closing = {
  title: 'Your first push in five minutes.',
  text: 'Create a workspace, connect a credential, send.',
};
