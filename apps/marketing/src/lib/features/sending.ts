import type { FeaturePage } from './index';

export const sending: FeaturePage = {
  slug: 'sending',
  name: 'Sending',
  icon: 'IconPaperPlaneTopRightFilled',
  group: 'Send',
  summary: 'Send to a person, a topic or a segment. BuzzKit finds their devices and handles delivery.',
  blurb: 'One call, every device',
  title: 'Send with one call.',
  continuation: 'To a person, a topic or a segment.',
  intro:
    'Send to a person or an audience. BuzzKit finds their devices, delivers through your credentials and records what happened.',
  vignette: 'send',
  sections: [
    {
      title: 'Send to people, not tokens.',
      text: 'Address a user id, a list of them, a topic or a segment. Combine a topic with any of those and preferences apply on their own.',
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
      title: 'More than a title and a body.',
      text: 'Add action buttons, a deep link, a badge, a sound or an image.',
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
      title: 'Fully idempotent.',
      text: 'Retry the same send and only one push goes out.',
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
      title: 'One request',
      text: 'A topic or a segment of any size is still one call.',
    },
    {
      title: 'Time to live',
      text: 'A stale notification never lands late.',
    },
    {
      title: 'Live counts',
      text: 'Sent, delivered, failed and invalid as the message goes out.',
    },
    {
      title: 'Quiet hours',
      text: 'Daily caps and quiet hours, with an override for alerts that cannot wait.',
    },
    {
      title: 'Cancel in time',
      text: 'A scheduled message can be canceled until it goes out.',
    },
    {
      title: 'Live Activities',
      text: 'The same API starts, updates and ends them.',
    },
  ],
  faq: [
    {
      question: 'How do I send a notification?',
      answer:
        'One POST with a title, a body and who it is for: a person, a topic or a segment. BuzzKit finds their devices and handles delivery.',
    },
    {
      question: 'What if I send the same request twice?',
      answer:
        'With an idempotency key, the second request returns the original message and nothing is sent again. Without one, two messages are created.',
    },
    {
      question: 'Can I send a silent push?',
      answer: 'Yes. A data-only message is a silent push.',
    },
  ],
  related: ['segments', 'scheduling', 'delivery'],
};
