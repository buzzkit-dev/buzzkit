import type { FeaturePage } from './index';

export const scheduling: FeaturePage = {
  slug: 'scheduling',
  name: 'Scheduling',
  icon: 'IconCalendarClockFilled',
  group: 'Send',
  summary: 'Hold a message for a moment, in one timezone or in every subscriber’s own.',
  blurb: 'Local time for every subscriber',
  title: 'Nine in the morning, everywhere.',
  continuation: 'Released as each clock gets there.',
  intro:
    'Add a schedule to a send and BuzzKit holds it until the moment arrives. Pick a fixed timezone, or let each subscriber receive it as their own clock reaches the time, released zone by zone.',
  vignette: 'schedule',
  sections: [
    {
      title: 'A wall-clock time, not an instant',
      text: 'The schedule takes a time without an offset and a timezone to read it in. With the subscriber timezone, the moment comes from the attribute the SDK stamps on identify, with a default for anyone without one.',
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
      text: 'A minute cron releases fixed-timezone messages at their instant, and subscriber-timezone messages one zone at a time. A zone is never sent twice, and a batch that dies is retried on the next tick.',
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
      text: 'A tenant-wide send policy applies to every visible push. Quiet hours defer a delivery to the next allowed local time, a daily cap counts sent deliveries per subscriber per local day, and topics carry their own cap on top.',
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
      text: 'Cancel up to the moment a message goes out.',
    },
    {
      title: 'Honest validation',
      text: 'A moment already past, a date off the calendar or an unknown zone is refused.',
    },
    {
      title: 'Expiry from the last release',
      text: 'The time to live counts from the last possible release.',
    },
    {
      title: 'Timezone from the backend',
      text: 'Set a subscriber’s timezone on identify from your server.',
    },
    {
      title: 'Recurring through workflows',
      text: 'A workflow trigger can be a cron or a daily time over a segment.',
    },
    {
      title: 'Local notifications',
      text: 'A workflow send can fire on the device at the moment, even offline.',
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
