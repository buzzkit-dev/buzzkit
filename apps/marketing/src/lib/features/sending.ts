import type { FeaturePage } from './index';

export const sending: FeaturePage = {
  slug: 'sending',
  name: 'Sending',
  icon: 'IconPaperPlaneTopRightFilled',
  group: 'Send',
  summary: 'One POST sends to a subscriber, a topic or a segment and lands on every device.',
  blurb: 'One POST, every device',
  title: 'One call, every device.',
  continuation: 'Target by id, topic or segment.',
  intro:
    'A send is one POST to /v1/messages: a title, a body and who it is for, by your own ids, a topic or a segment. BuzzKit resolves who is reachable, delivers with your own Apple and Firebase credentials and records every attempt.',
  vignette: 'send',
  sections: [
    {
      title: 'Target the way you already think',
      text: 'Address up to a thousand subscribers by your own ids, everyone opted into a topic, every member of a segment, or an inline expression on the send itself. A topic combines with any of them, so preferences still apply.',
      code: `POST /v1/messages
{
  "segment": "active-pro",
  "topic": "gym-reminders",
  "title": "Leg day",
  "body": "Let’s go. 6:00 with Maya.",
  "deepLink": "app://workouts/legs",
  "ttlSeconds": 3600
}`,
    },
    {
      title: 'The full notification, not a subset',
      text: 'Everything Apple and Firebase accept is on the request: subtitle, badge, sound, image, thread and collapse ids, interruption level, relevance score, up to four action buttons and a deep link. Raw fields cover anything provider-specific.',
      code: `POST /v1/messages
{
  "to": "user_42",
  "title": "Rest day is over",
  "body": "Your next workout is ready.",
  "badge": 1,
  "sound": "default",
  "interruptionLevel": "time-sensitive",
  "actions": [
    { "id": "snooze", "title": "Snooze" },
    {
      "id": "start",
      "title": "Start workout",
      "foreground": true
    }
  ],
  "deepLink": "app://workouts/next"
}`,
    },
    {
      title: 'Idempotent by design',
      text: 'Send an idempotency key with every request. A replay returns the original message and sends nothing, and the same key with a different body is refused.',
      code: `POST /v1/messages
Idempotency-Key: workout-2026-08-20-user_42

202 Accepted
Idempotent-Replayed: true
{
  "id": "msg_…",
  "status": "queued"
}`,
    },
  ],
  capabilities: [
    {
      title: 'Reachability resolved',
      text: 'Subscriptions, preferences and the channel switch are checked before queueing.',
    },
    {
      title: 'Expiry that holds',
      text: 'A time to live from one minute to 28 days, honored by the providers.',
    },
    {
      title: 'Counts you can trust',
      text: 'Pending, sent, failed and invalid, recounted from the ledger at completion.',
    },
    {
      title: 'Send policy',
      text: 'Quiet hours and a daily cap per tenant, with an override for alerts.',
    },
    { title: 'Cancel in time', text: 'A scheduled message can be canceled until the moment it releases.' },
    {
      title: 'Live Activities too',
      text: 'A sibling endpoint drives iOS Live Activities and reports per token.',
    },
  ],
  faq: [
    {
      question: 'How many subscribers can one send target?',
      answer:
        'A direct send takes up to a thousand ids. A topic or segment send has no fixed limit, since fan-out runs in pages of five hundred subscriptions that chain themselves.',
    },
    {
      question: 'What happens if the same request is sent twice?',
      answer:
        'With an idempotency key, the second request returns the original message and sends nothing. Without one, two messages are created.',
    },
    {
      question: 'Can I send a silent push?',
      answer:
        'Yes. A data-only message is a silent push, and the raw APNs and FCM fields cover content-available and priority.',
    },
  ],
  related: ['segments', 'scheduling', 'delivery'],
};
