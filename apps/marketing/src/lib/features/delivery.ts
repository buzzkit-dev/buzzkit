import type { FeaturePage } from './index';

export const delivery: FeaturePage = {
  slug: 'delivery',
  name: 'Delivery',
  icon: 'IconShieldCheckFilled',
  group: 'Send',
  summary:
    'Every send is queued, retried for hours and recorded down to the attempt, so a notification is never quietly lost.',
  blurb: 'Retries, receipts, nothing dropped',
  title: 'Every attempt, accounted for.',
  continuation: 'Queued, retried, recorded.',
  intro:
    'A send lands in a durable queue and fans out to every reachable device. When Apple or Firebase stumble, BuzzKit keeps trying for hours, every attempt is written down with the request, the response and the latency, and the device reports back when the push landed and when it was opened, so you always know what happened to a notification.',
  vignette: 'delivery',
  sections: [
    {
      title: 'Retries that never give up too early',
      text: 'A rate limit, an outage or a timeout is not a lost notification. BuzzKit backs off and retries for hours, honors the provider’s own Retry-After, and re-drives any job that goes missing, so a transient failure ends in a delivery instead of a gap in your numbers.',
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
      text: 'Apple and Firebase each speak their own dialect of failure. BuzzKit translates every reason into one set of outcomes and acts on it for you: dead tokens are retired on the spot, outages and rate limits retry, bad credentials fail fast, and a subscriber who opted out mid-flight is never reached.',
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
      title: 'Live counts, exact totals',
      text: 'Watch a message go out as it happens: sent, delivered, failed and invalid climb in real time as each batch lands and each receipt comes back. When the last delivery settles, the totals are reconciled against the ledger itself, so the number on the screen is the number that happened.',
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
      text: 'A topic or a segment with a million subscribers goes out in pages that resume where they left off, with no send repeated.',
    },
    {
      title: 'Never a double push',
      text: 'An idempotency key turns a retried request into the same message, not a second one.',
    },
    {
      title: 'Dead tokens retired for you',
      text: 'When Apple or Firebase reports a token gone, the device is marked invalid and never targeted again.',
    },
    {
      title: 'The attempt ledger',
      text: 'Every attempt keeps its request, response, provider reason and latency, ready to inspect.',
    },
    {
      title: 'Delivered and opened receipts',
      text: 'The iOS SDK reports when a push actually lands on the phone and when the person opens it, per message, on the subscriber timeline.',
    },
    {
      title: 'Nothing lost in the dark',
      text: 'A job that keeps crashing lands in a dead-letter queue where you can see it, instead of vanishing.',
    },
  ],
  faq: [
    {
      question: 'What happens when a push fails?',
      answer:
        'A temporary failure such as a rate limit or an outage retries with backoff for about four hours. A dead token marks the device invalid so it is never targeted again, and a bad credential fails at once so you hear about it. Every attempt stays in the ledger.',
    },
    {
      question: 'How do I know a push actually reached the device?',
      answer:
        'Sent means the provider accepted it, which is as far as any push provider can confirm. The iOS SDK closes the loop: a notification service extension reports a delivered receipt the moment the push lands on the phone, and the app reports opens, taps and typed replies. The delivery flips from sent to delivered when the receipt arrives, both land on the subscriber timeline as $notification.delivered and $notification.opened, and workflows can branch on them.',
    },
    {
      question: 'Can a retry send a notification to someone who unsubscribed in the meantime?',
      answer:
        'No. Every attempt checks the subscription first, so a subscriber who muted, removed or lost the device after fan-out is never reached.',
    },
  ],
  related: ['sending', 'scheduling', 'ios-sdk'],
};
