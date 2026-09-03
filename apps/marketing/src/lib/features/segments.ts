import type { FeaturePage } from './index';

export const segments: FeaturePage = {
  slug: 'segments',
  name: 'Segments',
  icon: 'IconTargetFilled',
  group: 'Automate',
  summary: 'Saved expressions over attributes and events, evaluated fresh at send time.',
  blurb: 'Expressions evaluated at send time',
  title: 'Who they are and what they did.',
  continuation: 'Evaluated the moment you send.',
  intro:
    'A segment is a saved, versioned expression: attributes, events and how often, last activity on a device, and which channels can reach them. It is never stored as a member list, so every send reads the audience as it is right now.',
  vignette: 'segment',
  sections: [
    {
      title: 'One grammar for every condition',
      text: 'Conditions nest in all, any and not groups. Attributes compare with equals, not equals, greater and less than, in, contains and exists; events count inside a window or never happened; activity and channel cover the rest.',
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
      title: 'Preview before you save',
      text: 'The preview endpoint answers with how many subscribers match right now and the first twenty of them, without saving anything. The dashboard builder calls it as you type.',
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
      title: 'Versioned, and pinned on send',
      text: 'Changing an expression creates a new version, and a message pins the version it used. An edit never changes who an in-flight message reaches, and every message explains its audience.',
      code: `POST /v1/messages
{
  "segment": "active-pro",
  "title": "Three evening slots opened up",
  "body": "Book before Maya’s class fills."
}

// The message remembers exactly who it went to
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
      text: 'Count an event within minutes, hours or days, or its absence.',
    },
    {
      title: 'System attributes',
      text: 'Country, timezone, language, app version and push permission, set from the device.',
    },
    {
      title: 'Fresh within seconds',
      text: 'One query over the event stream, as fresh as the last event.',
    },
    {
      title: 'Inline on a send',
      text: 'Write the expression on the message for a one-off audience.',
    },
    {
      title: 'Shared with workflows',
      text: 'Triggers, branches and schedules read the same grammar.',
    },
    {
      title: 'Typed in the SDK',
      text: 'Types and lint ship in the buzzkit package, before the request.',
    },
  ],
  faq: [
    {
      question: 'How fresh is a segment when I send to it?',
      answer:
        'Membership is evaluated at send time against the event stream, usually within seconds of the last event. Nothing is cached as a list.',
    },
    {
      question: 'Can a segment filter on event data, not just the event name?',
      answer:
        'Today a segment counts events by name inside a window. Event data is stored as a queryable column, and predicates on it are the next step of the grammar.',
    },
    {
      question: 'How large can an expression be?',
      answer:
        'Groups nest up to eight levels deep with at most fifty conditions, and an in condition takes up to a hundred values. The lint names the node when a limit is crossed.',
    },
  ],
  related: ['sending', 'workflows', 'topics'],
};
