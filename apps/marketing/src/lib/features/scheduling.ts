import type { FeaturePage } from './index';

export const scheduling: FeaturePage = {
  slug: 'scheduling',
  name: 'Scheduling',
  icon: 'IconCalendarClockFilled',
  group: 'Send',
  summary: 'Hold a send for later, or for 9 a.m. in each person’s time zone.',
  blurb: 'Later, or at local time',
  title: 'Schedule a send.',
  continuation: 'A time you pick, or each person’s local time.',
  intro:
    'Hold a notification until Tuesday, or until 9 a.m. wherever they are. Cancel until the last minute.',
  vignette: 'schedule',
  sections: [
    {
      title: 'Their clock, not yours.',
      text: 'Each person gets it when their own clock reaches the time. Anyone whose zone is unknown still gets it, on a default you set.',
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
      title: 'Quiet hours and daily caps.',
      text: 'A message due at midnight waits for morning. Nobody gets more than the daily cap.',
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
    {
      title: 'Released zone by zone.',
      text: 'As each time zone reaches the scheduled time, those messages go out. A zone is never sent twice.',
      code: `GET /v1/messages/msg_7g2h
{
  "status": "processing",
  "schedule": {
    "at": "2026-09-08T09:00",
    "timezone": "subscriber"
  },
  "counts": {
    "total": 2418,
    "sent": 1130,
    "pending": 1288
  }
}`,
    },
  ],
  capabilities: [
    {
      title: 'Cancel until it goes out',
      text: 'Change your mind up to the last minute.',
    },
    {
      title: 'Still valid in the last time zone',
      text: 'Time to live starts after every time zone has been sent.',
    },
    {
      title: 'Timezone from your backend',
      text: 'Set it from the server when your app knows better than the device.',
    },
    {
      title: 'Recurring through workflows',
      text: 'A cron or a daily local time over a segment.',
    },
    {
      title: 'Local notifications',
      text: 'Fire on the device at the exact minute, even offline.',
    },
  ],
  faq: [
    {
      question: 'Can I send the same message every week?',
      answer: 'Yes. A workflow on a cron or a daily local time, over a segment.',
    },
    {
      question: 'What if it is already past 9 a.m. in some time zones?',
      answer:
        'Those messages go out right away. The rest wait. If it has passed everywhere, the send is refused.',
    },
  ],
  related: ['sending', 'workflows', 'topics'],
};
