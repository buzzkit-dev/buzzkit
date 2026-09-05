import type { FeaturePage } from './index';

export const scheduling: FeaturePage = {
  slug: 'scheduling',
  name: 'Scheduling',
  icon: 'IconCalendarClockFilled',
  group: 'Send',
  summary:
    'Send at nine in the morning and have it arrive at nine in the morning for everyone, wherever they are.',
  blurb: 'Local time for every subscriber',
  title: 'Nine in the morning, everywhere.',
  continuation: 'Released as each clock gets there.',
  intro:
    'Add a schedule to a send and BuzzKit holds it until the moment comes. Pick one timezone for everyone, or let the message follow the sun: each subscriber receives it as their own clock reaches the time, released zone by zone.',
  vignette: 'schedule',
  sections: [
    {
      title: 'A wall-clock time, not an instant',
      text: 'You say nine in the morning, and BuzzKit works out what that means for every subscriber. The timezone comes from the attribute the SDK stamps on identify, with a default for anyone whose zone is unknown, so nobody is left out.',
      code: `POST /v1/messages
{
  "topic": "weekly-recap",
  "title": "Your week in numbers",
  "schedule": {
    "at": "2026-09-08T09:00",
    "timezone": "subscriber",
    "defaultTimezone": "Europe/Berlin"
  }
}`,
    },
    {
      title: 'Released zone by zone',
      text: 'As each timezone reaches the moment, its subscribers go out and the message reports progress as it circles the globe. A zone is never sent twice and a batch that fails is picked up on the next tick, so a scheduled send arrives exactly once.',
      code: `GET /v1/messages/msg_7g2h
{
  "status": "processing",
  "schedule": {
    "at": "2026-09-08T09:00",
    "timezone": "subscriber"
  },
  // Zones past 09:00 have gone out, the rest wait
  "counts": {
    "total": 2418,
    "sent": 1130,
    "pending": 1288
  }
}`,
    },
    {
      title: 'Quiet hours and daily caps',
      text: 'Set quiet hours and a daily cap once per tenant and every visible push respects them. A message due at midnight waits for the morning, a subscriber never gets more than their daily share, and a topic can carry a tighter cap of its own.',
      code: `PATCH /v1/tenants/gymly
{
  "settings": {
    "sendPolicy": {
      "quietHours": {
        "from": "22:00",
        "to": "08:00",
        "timezone": "subscriber"
      },
      "dailyCap": 3
    }
  }
}`,
    },
  ],
  capabilities: [
    {
      title: 'Cancel until it releases',
      text: 'Change your mind up to the moment a message goes out.',
    },
    {
      title: 'Honest validation',
      text: 'A moment already past, a date off the calendar or an unknown zone is refused before it can misfire.',
    },
    {
      title: 'Expiry from the last release',
      text: 'Time to live counts from the last zone’s release, so the message stays fresh everywhere.',
    },
    {
      title: 'Timezone from the backend',
      text: 'Set a subscriber’s timezone from your server when your app knows better than the device.',
    },
    {
      title: 'Recurring through workflows',
      text: 'The weekly recap is a workflow with a cron or a daily local time over a segment.',
    },
    {
      title: 'Local notifications',
      text: 'A workflow send can fire on the device at the exact minute, even offline.',
    },
  ],
  faq: [
    {
      question: 'How do I send a push at each user’s local time?',
      answer:
        'Add a schedule with the subscriber timezone option. BuzzKit releases the message as each person’s own clock reaches the time, with a default timezone for anyone whose zone is unknown.',
    },
    {
      question: 'Can I send the same message every week?',
      answer:
        'Recurrence is a workflow: a cron or daily trigger over a segment starts one run per member each time it fires, in a fixed timezone or each subscriber’s own.',
    },
    {
      question: 'What if the moment has already passed in some timezones?',
      answer:
        'Subscribers in zones past the time receive the message right away, and the rest wait for their own clock. A moment that has passed everywhere is refused.',
    },
  ],
  related: ['sending', 'workflows', 'topics'],
};
