import type { FaqItem } from './content';

export interface Plan {
  slug: string;
  name: string;
  price: string;
  prefix?: string;
  period?: string;
  audience: string;
  numbers: { label: string; value: string }[];
  cta: { label: string; href: string; variant: 'default' | 'elevated' };
}

export const pricing = {
  title: 'Pay for notifications delivered.',
  continuation: 'Not for every user you register.',
  intro:
    'Subscribers, devices, tenants and workflows are unlimited on every plan. You bring your own delivery providers and pay them directly, so a plan covers only what BuzzKit does.',
  beta: {
    title: 'Free and unlimited during the beta.',
    text: 'No card, no limits, and notice before any billing starts. The plans below are a preview of where pricing is heading, not a commitment, and can still change.',
  },
};

export const plans: Plan[] = [
  {
    slug: 'community',
    name: 'Self-hosted',
    price: '$0',
    audience: 'Run the whole product on your own servers for free. A setup guide arrives after the beta.',
    numbers: [
      { label: 'Deliveries', value: 'Unlimited' },
      { label: 'Events', value: 'Unlimited' },
      { label: 'Retention', value: 'You decide' },
      { label: 'Support', value: 'Community' },
    ],
    cta: {
      label: 'Read About Self-Hosting',
      href: 'https://docs.buzzkit.dev/platform/self-hosting',
      variant: 'elevated',
    },
  },
  {
    slug: 'free',
    name: 'Free',
    price: '$0',
    audience: 'Side projects and small apps. There’ll always be a free plan.',
    numbers: [
      { label: 'Deliveries', value: '100,000 a month' },
      { label: 'Events', value: '1 million a month' },
      { label: 'Retention', value: '7 days' },
      { label: 'Extra deliveries', value: 'Soft limit' },
      { label: 'Support', value: 'Community' },
    ],
    cta: { label: 'Get Started', href: 'https://buzzkit.dev/signup', variant: 'default' },
  },
  {
    slug: 'pro',
    name: 'Pro',
    price: '$49',
    period: 'a month',
    audience: 'Production apps with real notification volume.',
    numbers: [
      { label: 'Deliveries', value: '1 million a month' },
      { label: 'Events', value: '10 million a month' },
      { label: 'Retention', value: '30 days' },
      { label: 'Extra deliveries', value: '$0.25 per 1,000' },
      { label: 'Support', value: 'Email' },
    ],
    cta: { label: 'Get Started', href: 'https://buzzkit.dev/signup', variant: 'default' },
  },
  {
    slug: 'business',
    name: 'Business',
    price: '$299',
    period: 'a month',
    audience: 'Larger products and platforms sending for their customers.',
    numbers: [
      { label: 'Deliveries', value: '10 million a month' },
      { label: 'Events', value: '100 million a month' },
      { label: 'Retention', value: '90 days' },
      { label: 'Extra deliveries', value: '$0.10 per 1,000' },
      { label: 'Support', value: 'Priority, shared Slack' },
    ],
    cta: { label: 'Get Started', href: 'https://buzzkit.dev/signup', variant: 'default' },
  },
  {
    slug: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    audience: 'Custom terms, security review and dedicated hosting.',
    numbers: [
      { label: 'Deliveries', value: 'Custom' },
      { label: 'Events', value: 'Custom' },
      { label: 'Retention', value: 'Custom' },
      { label: 'Extra deliveries', value: 'Custom' },
      { label: 'Support', value: 'Dedicated' },
    ],
    cta: { label: 'Contact Us', href: '/contact', variant: 'elevated' },
  },
];

export const calculator = {
  title: 'Calculate your costs',
  text: 'Your deliveries are your active users times the notifications each of them gets. Put in your own numbers, add what a per-user tool charges you today, and compare the two.',
};

export const delivery = {
  title: 'What counts as a delivery',
  text: 'One recipient on one channel is one delivery, counted when BuzzKit hands the send to the provider. Retries are never billed again.',
  rows: [
    { action: 'Push to 1,000 subscribers', count: '1,000' },
    { action: 'Push and email to one subscriber', count: '2' },
    { action: 'Retries after a provider failure', count: '0' },
    { action: 'Blocked by preferences or a cap', count: '0' },
    { action: 'Skipped by a workflow branch', count: '0' },
    { action: 'Test send or dry run', count: '0' },
  ],
};

export const providers = {
  title: 'Your providers, your bill',
  text: 'BuzzKit sends through your own Apple and Firebase credentials, and through your own email and SMS providers as those channels arrive. You pay those providers directly and BuzzKit never marks a message up, so what you pay for here is the events, workflows, preferences, retries, the delivery ledger and the dashboard around them.',
};

type Cell = boolean | string;

export interface MatrixRow {
  feature: string;
  cells: [Cell, Cell, Cell, Cell, Cell];
  planned?: boolean;
}

export const matrix: { group: string; rows: MatrixRow[] }[] = [
  {
    group: 'Product',
    rows: [
      { feature: 'Push with your own APNs and FCM keys', cells: [true, true, true, true, true] },
      { feature: 'Unlimited subscribers, devices and tenants', cells: [true, true, true, true, true] },
      { feature: 'Events, segments and scheduling', cells: [true, true, true, true, true] },
      { feature: 'Workflows: waits, branches, loops, fetches', cells: [true, true, true, true, true] },
      { feature: 'Topics, preferences, quiet hours, caps', cells: [true, true, true, true, true] },
      { feature: 'Sources, webhooks and Live Activities', cells: [true, true, true, true, true] },
      { feature: 'Retries and the delivery ledger', cells: [true, true, true, true, true] },
      { feature: 'API, iOS SDK and the agent surface', cells: [true, true, true, true, true] },
    ],
  },
  {
    group: 'Scale',
    rows: [
      { feature: 'Deliveries a month', cells: ['100,000', '1 million', '10 million', 'Custom', 'Unlimited'] },
      { feature: 'Events a month', cells: ['1 million', '10 million', '100 million', 'Custom', 'Unlimited'] },
      {
        feature: 'Event and delivery history',
        cells: ['7 days', '30 days', '90 days', 'Custom', 'You decide'],
      },
      {
        feature: 'Extra deliveries',
        cells: ['Soft limit', '$0.25 per 1,000', '$0.10 per 1,000', 'Custom', 'Unlimited'],
      },
      {
        feature: 'Extra events',
        cells: ['Soft limit', 'To be announced', 'To be announced', 'Custom', 'Unlimited'],
      },
    ],
  },
  {
    group: 'Team and compliance',
    rows: [
      {
        feature: 'Team roles',
        cells: ['Basic', 'Basic', 'Advanced', 'Custom', 'Self-managed'],
        planned: true,
      },
      { feature: 'Audit log', cells: [false, false, true, true, 'Self-managed'] },
      { feature: 'SAML and SSO', cells: [false, false, 'Add-on', true, 'Self-managed'], planned: true },
      {
        feature: 'Data residency',
        cells: ['Default', 'Default', 'US or EU', 'Custom', 'Self-managed'],
        planned: true,
      },
      { feature: 'Security and legal documentation', cells: [false, false, true, true, false] },
      { feature: 'Dedicated infrastructure', cells: [false, false, false, 'Optional', 'Self-managed'] },
    ],
  },
  {
    group: 'Support',
    rows: [
      {
        feature: 'Support',
        cells: ['Community', 'Email', 'Priority, shared Slack', 'Dedicated', 'Community'],
      },
      { feature: 'Uptime SLA', cells: [false, false, '99.9%', 'Up to 99.99%', false] },
    ],
  },
];

export const pricingFaq: FaqItem[] = [
  {
    question: 'What happens when the beta ends?',
    answer:
      'You get notice before any billing starts, with time to pick a plan or move to self-hosting. A free plan will always exist.',
  },
  {
    question: 'Do you charge per user?',
    answer:
      'No. Subscribers, devices, tenants and team members are unlimited on every plan. The only metered unit is a delivery: one recipient on one channel.',
  },
  {
    question: 'What happens when I reach the Free limit?',
    answer:
      'Deliveries never stop. Past the included volume you are asked to upgrade, and sending carries on while you decide. Pro and Business bill the extra deliveries instead.',
  },
  {
    question: 'Which providers do I pay for?',
    answer:
      'Apple and Firebase are free, so push costs nothing beyond your plan. Email and SMS will need a provider such as Resend or Twilio when those channels arrive.',
  },
  {
    question: 'What is the difference between the plans?',
    answer:
      'Volume, history, compliance and support. Every plan has the whole product: workflows, segments, topics, sources and the delivery ledger.',
  },
];
