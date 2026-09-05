import type { FeaturePage } from './index';

export const sending: FeaturePage = {
  slug: 'sending',
  name: 'Sending',
  icon: 'IconPaperPlaneTopRightFilled',
  group: 'Send',
  summary: 'One POST reaches a subscriber, a topic or a whole segment, on every device they own.',
  blurb: 'One POST, every device',
  title: 'One call, every device.',
  continuation: 'Target by id, topic or segment.',
  intro:
    'Sending a notification is one POST: a title, a body and who it is for, by your own user ids, a topic or a segment. BuzzKit works out which devices can be reached, delivers through your own Apple and Firebase credentials and records every attempt along the way.',
  vignette: 'send',
  sections: [
    {
      title: 'Target the way you already think',
      text: 'Address people, not tokens. Send to a user id, to a list of them, to everyone opted into a topic or to a segment, or describe a one-off audience inline on the send itself. Combine a topic with any target and preferences apply on their own.',
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
      text: 'Nothing Apple or Firebase can show is off the table. Subtitle, badge, sound, image, threading, interruption level, relevance score, up to four action buttons and a deep link are all first-class fields, and raw fields reach anything provider-specific on top.',
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
      text: 'Retry a request as many times as you like. With an idempotency key, a replay returns the original message and sends nothing new, so a network hiccup or a retry loop never turns into a double push.',
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
      text: 'Subscriptions, preferences and channel switches are checked before anything is queued, so the people who can and want to receive it are the ones who do.',
    },
    {
      title: 'Expiry that holds',
      text: 'Set a time to live from one minute to 28 days and the providers honor it, so a stale notification never lands late.',
    },
    {
      title: 'Live counts',
      text: 'Pending, sent, failed and invalid update as the message goes out and are reconciled exactly at the end.',
    },
    {
      title: 'Send policy',
      text: 'Quiet hours and a daily cap per tenant keep you from over-sending, with an override for the alerts that cannot wait.',
    },
    {
      title: 'Cancel in time',
      text: 'A scheduled message can be canceled right up to the moment it releases.',
    },
    {
      title: 'Live Activities too',
      text: 'The same API starts, updates and ends iOS Live Activities and reports what Apple answered.',
    },
  ],
  faq: [
    {
      question: 'How many subscribers can one send target?',
      answer:
        'A direct send takes up to a thousand ids at once. A topic or a segment has no ceiling: fan-out runs in pages that chain themselves, so a million-subscriber audience is still one request.',
    },
    {
      question: 'What happens if the same request is sent twice?',
      answer:
        'With an idempotency key, the second request returns the original message and nothing is sent again. Without one, two messages are created.',
    },
    {
      question: 'Can I send a silent push?',
      answer:
        'Yes. A data-only message is a silent push, and the raw Apple and Firebase fields give you content-available, priority and anything else provider-specific.',
    },
  ],
  related: ['segments', 'scheduling', 'delivery'],
};
