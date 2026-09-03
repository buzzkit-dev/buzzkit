import type { FeaturePage } from './index';

export const delivery: FeaturePage = {
  slug: 'delivery',
  name: 'Delivery',
  icon: 'IconShieldCheckFilled',
  group: 'Send',
  summary: 'A durable queue, progressive retries, and a ledger of every attempt to every device.',
  blurb: 'Retries and a ledger of every attempt',
  title: 'Every attempt, accounted for.',
  continuation: 'Queued, retried, recorded.',
  intro:
    'One send fans out to every reachable device through a durable queue. Each attempt goes to Apple or Firebase with your credentials, is retried with backoff when that makes sense, and is written to a ledger with the request, the response and the latency.',
  vignette: 'delivery',
  sections: [
    {
      title: 'Retries that respect the provider',
      text: 'Transient failures retry at 5 seconds, 30 seconds, 2 minutes, 10 minutes, 30 minutes, 1 hour and 2 hours after the first attempt, each with jitter. Retry-After is honored, rate limits and timeouts carry a 60 second floor, and a lost job is re-driven by the reconciliation cron.',
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
      title: 'One error language for every provider',
      text: 'Providers classify their native reasons into a shared taxonomy, and policy lives in the core. A dead token flips the subscription to invalid, rate limits and outages retry, bad credentials fail at once, and a subscription muted mid-flight fails as unsubscribed.',
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
      title: 'Counts you can trust',
      text: 'While a message is processing, counters advance per batch. Completion is derived, never counted: once nothing is pending or retrying, every counter is recounted from the deliveries and written exactly.',
      code: `GET /v1/messages/msg_7g2h
{
  "status": "completed",
  "counts": {
    "total": 2418,
    "sent": 2412,
    "failed": 3,
    "invalid": 3
  },
  "completedAt": "2026-09-01T09:04:12Z"
}`,
    },
  ],
  capabilities: [
    {
      title: 'Durable fan-out',
      text: 'Pages of 500 subscriptions chain themselves and resume from a cursor.',
    },
    {
      title: 'Idempotent sends',
      text: 'An idempotency key makes identical requests one message.',
    },
    {
      title: 'Dead tokens cleaned up',
      text: 'An APNs 410 or FCM unregistered flips the subscription to invalid.',
    },
    {
      title: 'The attempt ledger',
      text: 'Request, response, provider reason and latency on every attempt.',
    },
    {
      title: 'Send policy',
      text: 'Quiet hours and daily caps per tenant and topic.',
    },
    {
      title: 'Dead-letter queue',
      text: 'Jobs that crash repeatedly land somewhere visible.',
    },
  ],
  faq: [
    {
      question: 'What happens when a push fails?',
      answer:
        'A temporary failure, such as a rate limit or an outage, retries with backoff for about four hours. A dead token marks the device invalid, and a bad credential fails at once. Every attempt stays in the ledger.',
    },
    {
      question: 'How do I know a push actually reached the device?',
      answer:
        'Sent means the provider accepted it, which is the most a push provider confirms. The iOS SDK also tracks $notification.delivered and $notification.opened on the subscriber timeline.',
    },
    {
      question: 'Can a retry send a notification to someone who unsubscribed in the meantime?',
      answer:
        'No. Every attempt checks the subscription first and fails as unsubscribed if it was muted, removed or invalidated after fan-out.',
    },
  ],
  related: ['sending', 'scheduling', 'ios-sdk'],
};
