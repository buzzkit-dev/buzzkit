import type { FeaturePage } from './index';

export const segments: FeaturePage = {
  slug: 'segments',
  name: 'Segments',
  icon: 'IconTargetFilled',
  group: 'Automate',
  summary: 'Reach new users, paying customers or people who have not opened the app in a week.',
  blurb: 'Who they are, what they did',
  title: 'Reach exactly who you want.',
  continuation: 'Evaluated when you send.',
  intro:
    'Combine attributes, events and activity into an audience. There is no list to export or keep in sync, because it is worked out the moment you send.',
  vignette: 'segment',
  sections: [
    {
      title: 'Who they are and what they did.',
      text: 'Attributes, events, last activity, who can be reached. Combine them however you need.',
      code: `{
  "all": [
    { "ref": "attributes.plan", "eq": "pro" },
    {
      "count": "workout.completed",
      "within": "7d",
      "gte": 3
    },
    { "lastSeen": { "within": "30d" } },
    { "channel": "push" }
  ]
}`,
    },
    {
      title: 'See the audience first.',
      text: 'Preview the count and a sample of who matches before you send.',
      code: `POST /v1/segments/preview
{
  "expression": {
    "count": "workout.completed",
    "within": "7d",
    "gte": 3
  }
}

{ "count": 1284, "sample": [ … ] }`,
    },
    {
      title: 'Every send records the audience it used.',
      text: 'Change a segment later and the message still shows which version went out, and to how many people.',
      code: `POST /v1/messages
{
  "segment": "active-pro",
  "title": "Three evening slots opened up",
  "body": "Book before Maya’s class fills."
}

{
  "id": "msg_7g2h",
  "targets": {
    "segment": "active-pro",
    "segmentVersion": 4
  },
  "counts": { "total": 1284, "sent": 1279 }
}`,
    },
  ],
  capabilities: [
    {
      title: 'Event windows',
      text: 'Three workouts this week, or none in a month.',
    },
    {
      title: 'Device facts',
      text: 'Country, time zone, language, app version and push permission, without tracking them yourself.',
    },
    {
      title: 'Always current',
      text: 'As fresh as the last event that came in.',
    },
    {
      title: 'Inline on a send',
      text: 'A one-off audience without saving a segment.',
    },
    {
      title: 'Same expression everywhere',
      text: 'Workflows and schedules take the one you already wrote.',
    },
    {
      title: 'Typed in the SDK',
      text: 'A broken expression fails on your machine, not in production.',
    },
  ],
  faq: [
    {
      question: 'Can I filter on what is inside an event?',
      answer:
        'Right now you can filter by the event name and a time window. Filtering on the data inside an event is coming.',
    },
  ],
  related: ['sending', 'workflows', 'topics'],
};
