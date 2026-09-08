import type { FeaturePage } from './index';

export const delivery: FeaturePage = {
  slug: 'delivery',
  name: 'Delivery',
  icon: 'IconShieldCheckFilled',
  group: 'Send',
  summary: 'Native tracing for every push: sent, delivered, opened, or why it failed.',
  blurb: 'Native tracing',
  title: 'See what happened to every push.',
  continuation: 'Native tracing, automatic retries.',
  intro:
    'See whether a push was sent, delivered or opened, and why it failed, with automatic retries on failure.',
  vignette: 'delivery',
  sections: [
    {
      title: 'Every attempt is recorded.',
      text: 'Native tracing shows sent, delivered, opened, or why it failed.',
      code: `GET /v1/deliveries/dlv_8h2k/attempts
{
  "data": [
    {
      "attempt": 1,
      "outcome": "retrying",
      "errorCode": "rate_limited",
      "providerStatus": 429,
      "latencyMs": 412
    },
    {
      "attempt": 2,
      "outcome": "sent",
      "providerStatus": 200,
      "latencyMs": 142
    }
  ]
}`,
    },
    {
      title: 'Retries that keep going.',
      text: 'A rate limit or an outage is not a lost notification. BuzzKit keeps trying.',
      code: `GET /v1/deliveries/dlv_8h2k
{
  "status": "retrying",
  "attempts": 3,
  "lastErrorCode": "rate_limited",
  "nextAttemptAt": "2026-09-01T09:12:04Z",
  "externalId": "user_42",
  "platform": "ios"
}`,
    },
    {
      title: 'Live counts.',
      text: 'Sent, delivered, failed and invalid update as the send goes out.',
      code: `GET /v1/messages/msg_7g2h
{
  "status": "completed",
  "counts": {
    "total": 2418,
    "sent": 2412,
    "delivered": 2380,
    "failed": 3,
    "invalid": 3
  },
  "completedAt": "2026-09-01T09:04:12Z"
}`,
    },
  ],
  capabilities: [
    {
      title: 'Fan-out at any scale',
      text: 'A million-person audience is still one request, sent in pages that resume where they left off.',
    },
    {
      title: 'Safe to retry',
      text: 'An idempotency key turns a retried request into the same message, not a second one.',
    },
    {
      title: 'Dead tokens retired',
      text: 'When a device is gone, it is marked invalid and never targeted again.',
    },
    {
      title: 'The attempt ledger',
      text: 'Request, response, reason and latency, ready to inspect.',
    },
    {
      title: 'Delivered and opened',
      text: 'The SDK reports when a push lands and when it is opened.',
    },
    {
      title: 'Nothing vanishes',
      text: 'A job that keeps crashing is still visible.',
    },
  ],
  faq: [
    {
      question: 'What happens when a push fails?',
      answer:
        'Temporary failures retry for about four hours. A dead token is retired. A bad credential fails at once. Native tracing keeps every attempt.',
    },
    {
      question: 'What if someone unsubscribes while a retry is waiting?',
      answer: 'They will not get it. Every attempt checks before sending.',
    },
  ],
  related: ['sending', 'scheduling', 'ios-sdk'],
};
